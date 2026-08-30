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
import { renderScheduleStatusBox } from "./scheduler/status.js";
import { SkillInstaller } from "./skill/installer.js";
import { Logger } from "./utils/logger.js";
import { ConfigInitWizard } from "./config/init.js";
import { ANSI } from "./tui/ansi.js";

interface ParsedArgs {
  configPath?: string;
  outputRoot?: string;
  retentionDays?: number;
  cleanExpired?: boolean;
  repoPath?: string;
  dateStr?: string;
  sinceStr?: string;
  untilStr?: string;
  dateRange?: string;
  sinceHours?: number;
  diffMode?: boolean;
  viewFile?: string;
  init?: boolean;
  quickInit?: boolean;
  localInit?: boolean;
  globalInit?: boolean;
  installSkill?: boolean;
  scheduleInstall?: boolean;
  scheduleStatus?: boolean;
  scheduleRemove?: boolean;
  scheduleTime?: string;
  expiresAt?: string;
  expireDays?: number;
  expireSchedule?: string;
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
    } else if (arg === "--init" || arg === "init") {
      result.init = true;
    } else if (arg === "--quick" || arg === "--quick-init" || arg === "-q") {
      result.quickInit = true;
    } else if (arg === "--local") {
      result.localInit = true;
    } else if (arg === "--global") {
      result.globalInit = true;
    } else if (
      arg === "clean" ||
      arg === "cleanup" ||
      arg === "prune" ||
      arg === "--clean" ||
      arg === "--cleanup" ||
      arg === "--clean-expired" ||
      arg === "--clean-reports" ||
      arg === "--prune"
    ) {
      result.cleanExpired = true;
    } else if ((arg === "--retention-days" || arg === "--days" || arg === "-d") && i + 1 < args.length) {
      result.retentionDays = parseInt(args[++i] ?? "30", 10);
    } else if (arg === "--expire-schedule" && i + 1 < args.length) {
      result.expireSchedule = args[++i];
    } else if ((arg === "--expires" || arg === "--expire-at") && i + 1 < args.length) {
      result.expiresAt = args[++i];
    } else if (arg === "--expire-days" && i + 1 < args.length) {
      result.expireDays = parseInt(args[++i] ?? "0", 10);
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
  ingest --init                       Interactive configuration setup wizard
  ingest --init --quick               Quick setup with intelligent defaults (.ingestrc)
  ingest clean [--days <N>]           Clean up / prune expired reports (default 30 days)
  ingest [config-path]                Run headless generation for all repos in config
  ingest --repo <path>                Run report for a single repository
  ingest --date <YYYY-MM-DD>          Generate report for a specific date
  ingest --date <start>..<end>        Generate report for a date range (e.g. 2026-08-01..2026-08-07)
  ingest --since <date> --until <date> Generate report for a custom date range
  ingest --diff                       Enable Git diff deep-dive analysis
  ingest --clean                      Prune expired reports past retention period
  ingest --view <report.md>           View markdown report in terminal pager
  ingest --install-skill              Deploy AI skill to ~/.gemini/config/skills/ingest/
  ingest --schedule-install           Install automated daily scheduler (launchd / cron)
  ingest --schedule-install --expires <YYYY-MM-DD>  Install scheduler with automatic expiration date
  ingest --schedule-status            Check current scheduler status
  ingest --schedule-remove            Remove automated schedules

${ANSI.bold}OPTIONS:${ANSI.reset}
  --init                      Launch interactive configuration wizard
  -q, --quick                 Use recommended defaults for fast initialization
  --local                     Target local repo configuration (.ingestrc)
  --global                    Target global configuration (~/.config/ingest/config.jsonc)
  -i, --interactive           Force interactive TUI mode
  --clean, clean              Prune expired reports older than retention period
  -d, --days <N>              Override expiration retention window in days (default: 30)
  --config <path>             Path to custom config.jsonc
  --output-root <path>        Override report output directory
  --retention-days <days>     Report expiration retention period in days (default: 30, 0 = keep forever)
  --expires <YYYY-MM-DD>      Set expiration date for automated scheduler
  --expire-days <days>        Set expiration duration in days for automated scheduler
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
  if (parsed.retentionDays !== undefined) {
    config.retentionDays = parsed.retentionDays;
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
      const baseRepo = { path: resolved, repo_name: null, branches: branches.length > 0 ? branches.slice(0, 2) : ["main"] };
      targetRepos = [await ConfigManager.mergeRepoWithLocalConfig(baseRepo, resolved)];
    }
  }

  if (targetRepos.length === 0) {
    // If no repos configured and CWD is a repo, run on CWD
    if (await isGitRepo(process.cwd())) {
      const branches = await getGitBranches(process.cwd());
      const baseRepo = { path: process.cwd(), repo_name: null, branches: branches.length > 0 ? branches.slice(0, 2) : ["main"] };
      targetRepos = [await ConfigManager.mergeRepoWithLocalConfig(baseRepo, process.cwd())];
    } else {
      Logger.warn("No repositories configured in config.jsonc, local .ingestrc, or specified via --repo.");
      return;
    }
  }

  Logger.info(`Processing ${targetRepos.length} repository(ies)...`);

  for (const repo of targetRepos) {
    try {
      const repoPath = await resolveRepoPath(repo.path);
      const effectiveRepo = await ConfigManager.mergeRepoWithLocalConfig(repo, repoPath);
      const repoName = await getRepoName(repoPath, effectiveRepo.repo_name);
      const branches = effectiveRepo.branches && effectiveRepo.branches.length > 0 ? effectiveRepo.branches : ["main"];

      console.log(`\n\x1b[1mAnalyzing repo:\x1b[0m \x1b[36m${repoName}\x1b[0m (${repoPath})`);

      const commits = await fetchRepoCommits(repoPath, branches, dateFilter);
      Logger.info(`Found ${commits.length} commits across [${branches.join(", ")}].`);

      let diffStat;
      if ((parsed.diffMode || effectiveRepo.diff_mode !== false) && commits.length > 0) {
        diffStat = await fetchDiffStat(repoPath, branches, dateFilter, effectiveRepo.max_diff_lines);
      }

      const activePrompt = await resolveRepoPrompt(
        config.prompt,
        effectiveRepo.custom_prompt,
        effectiveRepo.custom_prompt_file,
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

  // Automatic report cleanup if retention period configured
  if (config.retentionDays > 0) {
    const deleted = await ReportStorage.cleanExpiredReports(config.outputRoot, config.retentionDays);
    if (deleted.length > 0) {
      Logger.info(`Cleaned up ${deleted.length} expired report(s) (> ${config.retentionDays} days old).`);
    }
  }
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const parsed = parseCliArgs(args);

  // Self-expiration check for scheduled execution
  if (parsed.expireSchedule) {
    const expTimestamp = new Date(`${parsed.expireSchedule}T23:59:59.999Z`).getTime();
    if (!isNaN(expTimestamp) && Date.now() > expTimestamp) {
      await CronScheduler.uninstall();
      if (LaunchdScheduler.isMacOS()) {
        await LaunchdScheduler.uninstall();
      }
      Logger.info(`Automated schedule expired on ${parsed.expireSchedule}. Schedule has been automatically uninstalled.`);
      return;
    }
  }

  if (parsed.help) {
    printHelp();
    return;
  }

  if (parsed.init || parsed.quickInit) {
    await ConfigInitWizard.run({
      quick: parsed.quickInit,
      local: parsed.localInit,
      global: parsed.globalInit,
      cwd: process.cwd(),
    });
    return;
  }

  if (parsed.installSkill) {
    await SkillInstaller.installGlobal();
    return;
  }

  if (parsed.cleanExpired) {
    const config = await ConfigManager.load(parsed.configPath);
    if (parsed.outputRoot) {
      config.outputRoot = resolve(parsed.outputRoot);
    }
    const days = parsed.retentionDays !== undefined ? parsed.retentionDays : config.retentionDays;
    console.log(`\x1b[36mCleaning expired reports in ${config.outputRoot} (> ${days} days old)...\x1b[0m`);
    const deleted = await ReportStorage.cleanExpiredReports(config.outputRoot, days);
    if (deleted.length === 0) {
      Logger.info("No expired reports found.");
    } else {
      Logger.success(`Cleaned up ${deleted.length} expired report(s):`);
      for (const p of deleted) {
        console.log(`  \x1b[90m- ${p}\x1b[0m`);
      }
    }
    return;
  }

  if (parsed.scheduleStatus) {
    const statusBox = await renderScheduleStatusBox();
    console.log(`\n${statusBox}\n`);
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
    let expiresAt = parsed.expiresAt;
    if (!expiresAt && parsed.expireDays && parsed.expireDays > 0) {
      const target = new Date(Date.now() + parsed.expireDays * 86400000);
      expiresAt = target.toISOString().slice(0, 10);
    }
    const schedConfig = {
      frequency: "daily" as const,
      time,
      configPath: parsed.configPath,
      expiresAt,
      expireDays: parsed.expireDays,
    };

    if (LaunchdScheduler.isMacOS()) {
      await LaunchdScheduler.install(schedConfig);
      const expMsg = expiresAt ? ` (expires: ${expiresAt})` : "";
      Logger.success(`macOS LaunchAgent installed for ${time}${expMsg}`);
    } else {
      await CronScheduler.install(schedConfig);
      const expMsg = expiresAt ? ` (expires: ${expiresAt})` : "";
      Logger.success(`Crontab installed for ${time}${expMsg}`);
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
