#!/usr/bin/env node

import { resolve } from "node:path";
import { ConfigManager } from "./config/manager.js";
import { InteractiveTUI } from "./tui/menu.js";
import { isGitRepo, resolveRepoPath, getGitBranches, getRepoName } from "./git/runner.js";
import { fetchRepoCommits, resolveDateFilter } from "./git/log.js";
import { fetchDiffStat } from "./git/diff.js";
import { AIFactory } from "./ai/factory.js";
import { resolveRepoPrompt } from "./ai/prompt.js";
import { formatReportMarkdown, generateEmptyReport } from "./report/generator.js";
import { ReportStorage } from "./report/storage.js";
import { renderReportFileToAnsi } from "./report/viewer.js";
import { showTerminalPager } from "./tui/pager.js";
import { CronScheduler } from "./scheduler/cron.js";
import { LaunchdScheduler } from "./scheduler/launchd.js";
import { SkillInstaller } from "./skill/installer.js";
import { Logger } from "./utils/logger.js";
import { ANSI } from "./tui/ansi.js";

interface ParsedArgs {
  configPath?: string;
  outputRoot?: string;
  repoPath?: string;
  dateStr?: string;
  sinceStr?: string;
  untilStr?: string;
  dateRange?: string;
  sinceHours?: number;
  diffMode?: boolean;
  viewFile?: string;
  installSkill?: boolean;
  scheduleInstall?: boolean;
  scheduleStatus?: boolean;
  scheduleRemove?: boolean;
  scheduleTime?: string;
  interactive?: boolean;
  help?: boolean;
}

function parseCliArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";

    if (arg === "-h" || arg === "--help") {
      result.help = true;
    } else if (arg === "-i" || arg === "--interactive") {
      result.interactive = true;
    } else if (arg === "--config" && i + 1 < args.length) {
      result.configPath = args[++i];
    } else if (arg === "--output-root" && i + 1 < args.length) {
      result.outputRoot = args[++i];
    } else if (arg === "--repo" && i + 1 < args.length) {
      result.repoPath = args[++i];
    } else if (arg === "--date" && i + 1 < args.length) {
      result.dateStr = args[++i];
    } else if (arg === "--since" && i + 1 < args.length) {
      result.sinceStr = args[++i];
    } else if (arg === "--until" && i + 1 < args.length) {
      result.untilStr = args[++i];
    } else if ((arg === "--range" || arg === "--date-range") && i + 1 < args.length) {
      result.dateRange = args[++i];
    } else if (arg === "--diff") {
      result.diffMode = true;
    } else if (arg === "--view" && i + 1 < args.length) {
      result.viewFile = args[++i];
    } else if (arg === "--install-skill") {
      result.installSkill = true;
    } else if (arg === "--schedule-install") {
      result.scheduleInstall = true;
    } else if (arg === "--schedule-status") {
      result.scheduleStatus = true;
    } else if (arg === "--schedule-remove") {
      result.scheduleRemove = true;
    } else if (arg === "--time" && i + 1 < args.length) {
      result.scheduleTime = args[++i];
    } else if (!arg.startsWith("-") && !result.configPath) {
      result.configPath = arg;
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
${ANSI.bold}${ANSI.brightCyan}ingest${ANSI.reset} - AI Daily Report Generator & Git Activity Explorer

${ANSI.bold}USAGE:${ANSI.reset}
  ingest                              Launch interactive TUI
  ingest [config-path]                Run headless generation for all repos in config
  ingest --repo <path>                Run report for a single repository
  ingest --date <YYYY-MM-DD>          Generate report for a specific date
  ingest --date <start>..<end>        Generate report for a date range (e.g. 2026-08-01..2026-08-07)
  ingest --since <date> --until <date> Generate report for a custom date range
  ingest --diff                       Enable Git diff deep-dive analysis
  ingest --view <report.md>           View markdown report in terminal pager
  ingest --install-skill              Deploy AI skill to ~/.gemini/config/skills/ingest/
  ingest --schedule-install           Install automated daily scheduler (launchd / cron)
  ingest --schedule-status            Check current scheduler status
  ingest --schedule-remove            Remove automated schedules

${ANSI.bold}OPTIONS:${ANSI.reset}
  -i, --interactive           Force interactive TUI mode
  --config <path>             Path to custom config.jsonc
  --output-root <path>        Override report output directory
  --date <date|range>         Specific date (YYYY-MM-DD) or range (YYYY-MM-DD..YYYY-MM-DD)
  --since <date>              Start date for commit history
  --until <date>              End date for commit history
  --range <start..end>        Date range alias
  --time <HH:MM>              Scheduled run time (default: 00:00)
  -h, --help                  Show this help message
`);
}

async function runHeadless(parsed: ParsedArgs): Promise<void> {
  const config = await ConfigManager.load(parsed.configPath);
  if (parsed.outputRoot) {
    config.outputRoot = resolve(parsed.outputRoot);
  }

  const resolvedDate = resolveDateFilter({
    dateStr: parsed.dateRange || parsed.dateStr,
    sinceStr: parsed.sinceStr,
    untilStr: parsed.untilStr,
    sinceHours: parsed.sinceHours,
  });
  const dateStr = resolvedDate.reportDateStr;
  const dateFilter = resolvedDate.dateFilter;

  let targetRepos = config.repos;
  if (parsed.repoPath) {
    const resolved = await resolveRepoPath(parsed.repoPath);
    const existing = config.repos.find((r) => r.path === resolved);
    if (existing) {
      targetRepos = [existing];
    } else {
      const branches = await getGitBranches(resolved);
      targetRepos = [{ path: resolved, repo_name: null, branches: branches.length > 0 ? branches.slice(0, 2) : ["main"] }];
    }
  }

  if (targetRepos.length === 0) {
    // If no repos configured and CWD is a repo, run on CWD
    if (await isGitRepo(process.cwd())) {
      const branches = await getGitBranches(process.cwd());
      targetRepos = [{ path: process.cwd(), repo_name: null, branches: branches.length > 0 ? branches.slice(0, 2) : ["main"] }];
    } else {
      Logger.warn("No repositories configured in config.jsonc or specified via --repo.");
      return;
    }
  }

  Logger.info(`Processing ${targetRepos.length} repository(ies)...`);

  for (const repo of targetRepos) {
    try {
      const repoPath = await resolveRepoPath(repo.path);
      const repoName = await getRepoName(repoPath, repo.repo_name);
      const branches = repo.branches && repo.branches.length > 0 ? repo.branches : ["main"];

      console.log(`\n\x1b[1mAnalyzing repo:\x1b[0m \x1b[36m${repoName}\x1b[0m (${repoPath})`);

      const commits = await fetchRepoCommits(repoPath, branches, dateFilter);
      Logger.info(`Found ${commits.length} commits across [${branches.join(", ")}].`);

      let diffStat;
      if ((parsed.diffMode || repo.diff_mode !== false) && commits.length > 0) {
        diffStat = await fetchDiffStat(repoPath, branches, dateFilter, repo.max_diff_lines);
      }

      const activePrompt = await resolveRepoPrompt(
        config.prompt,
        repo.custom_prompt,
        repo.custom_prompt_file,
        repoPath,
      );

      const analysisContext = {
        repoName,
        repoPath,
        branches,
        dateStr,
        commits,
        diffStat,
        customPrompt: activePrompt,
        basePrompt: config.prompt,
      };

      let reportMarkdown = "";
      let reportMeta;

      if (commits.length === 0) {
        Logger.info(`No commits found for ${repoName}. Generating empty report.`);
        const res = generateEmptyReport(analysisContext);
        reportMarkdown = res.markdown;
        reportMeta = res.meta;
      } else {
        Logger.info(`Calling AI provider (${config.defaultProvider})...`);
        const provider = AIFactory.getProvider(config);
        const aiResult = await provider.analyze(analysisContext);
        const res = formatReportMarkdown(analysisContext, aiResult);
        reportMarkdown = res.markdown;
        reportMeta = res.meta;
      }

      const saved = await ReportStorage.saveReport(config.outputRoot, reportMeta, reportMarkdown);
      Logger.success(`Report written to ${saved.filePath}`);
    } catch (err) {
      await Logger.error(`Failed to generate report for ${repo.path}`, err);
    }
  }
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const parsed = parseCliArgs(args);

  if (parsed.help) {
    printHelp();
    return;
  }

  if (parsed.installSkill) {
    await SkillInstaller.installGlobal();
    return;
  }

  if (parsed.scheduleStatus) {
    const isMac = LaunchdScheduler.isMacOS();
    if (isMac) {
      const status = await LaunchdScheduler.getStatus();
      console.log(`macOS LaunchAgent: ${status.active ? "ACTIVE" : "INACTIVE"} (${status.details})`);
    }
    const cronStatus = await CronScheduler.getStatus();
    console.log(`Crontab: ${cronStatus.active ? "ACTIVE" : "INACTIVE"} (${cronStatus.details})`);
    return;
  }

  if (parsed.scheduleRemove) {
    await CronScheduler.uninstall();
    if (LaunchdScheduler.isMacOS()) {
      await LaunchdScheduler.uninstall();
    }
    Logger.success("Automated schedules removed.");
    return;
  }

  if (parsed.scheduleInstall) {
    const time = parsed.scheduleTime || "00:00";
    if (LaunchdScheduler.isMacOS()) {
      await LaunchdScheduler.install({ frequency: "daily", time, configPath: parsed.configPath });
      Logger.success(`macOS LaunchAgent installed for ${time}`);
    } else {
      await CronScheduler.install({ frequency: "daily", time, configPath: parsed.configPath });
      Logger.success(`Crontab installed for ${time}`);
    }
    return;
  }

  if (parsed.viewFile) {
    const lines = await renderReportFileToAnsi(parsed.viewFile);
    await showTerminalPager(lines, parsed.viewFile.split("/").pop() || "Report");
    return;
  }

  // Interactive mode check: if explicit -i OR no CLI flags & isTTY
  const isInteractive = parsed.interactive || (args.length === 0 && process.stdin.isTTY);

  if (isInteractive) {
    await InteractiveTUI.run(parsed.configPath);
  } else {
    await runHeadless(parsed);
  }
}

// Execute if run directly
main().catch(async (err) => {
  await Logger.error("Unexpected runtime failure", err);
  process.exit(1);
});
