#!/usr/bin/env node

import { resolve } from "node:path";
import { ConfigManager } from "./config/manager.js";
import { InteractiveTUI } from "./tui/menu.js";
import { isGitRepo, resolveRepoPath, getGitBranches, getRepoName, fetchRemoteOrigin } from "./git/runner.js";
import { fetchRepoCommits, resolveDateFilter, getCommitsBetweenRefs, parseCompareRange } from "./git/log.js";
import { fetchDiffStat, fetchDiffStatBetweenRefs } from "./git/diff.js";
import { getLocalDaysAheadString } from "./utils/date.js";
import { AIFactory } from "./ai/factory.js";
import { resolveRepoPrompt } from "./ai/prompt.js";
import { formatReportMarkdown, generateEmptyReport, formatWorkspaceRollupMarkdown, generateEmptyWorkspaceRollup } from "./report/generator.js";
import { buildMultiRepoRollupPrompt } from "./ai/prompt.js";
import type { RepoRollupActivity, MultiRepoRollupContext, AnalysisResult } from "./ai/types.js";
import type { ReportMeta } from "./report/types.js";
import { ReportStorage } from "./report/storage.js";
import { renderReportFileToAnsi } from "./report/viewer.js";
import { showTerminalPager } from "./tui/pager.js";
import { CronScheduler } from "./scheduler/cron.js";
import { LaunchdScheduler } from "./scheduler/launchd.js";
import { renderScheduleStatusBox } from "./scheduler/status.js";
import type { ScheduleConfig, ScheduleFrequency } from "./scheduler/types.js";
import { formatScheduleSummary } from "./scheduler/helpers.js";
import { SkillInstaller } from "./skill/installer.js";
import { Logger } from "./utils/logger.js";
import { ConfigInitWizard } from "./config/init.js";
import { IngestWebServer } from "./server/server.js";
import { ANSI } from "./tui/ansi.js";
import { installTerminalGuard } from "./tui/guard.js";
import { formatReport, type OutputFormat } from "./report/formatter.js";
import { pooledMap } from "./utils/concurrency.js";
import { type ParsedArgs, parseCliArgs, printHelp } from "./cli/parser.js";

export type { ParsedArgs };
export { parseCliArgs, printHelp };

async function runHeadless(parsed: ParsedArgs): Promise<void> {
  const config = await ConfigManager.load(parsed.configPath);
  if (parsed.outputRoot) {
    config.outputRoot = resolve(parsed.outputRoot);
  }
  if (parsed.retentionDays !== undefined) {
    config.retentionDays = parsed.retentionDays;
  }

  const resolvedDate = resolveDateFilter({
    dateStr: parsed.today ? "today" : (parsed.dateRange || parsed.dateStr),
    sinceStr: parsed.sinceStr,
    untilStr: parsed.untilStr,
    sinceHours: parsed.sinceHours,
    today: parsed.today,
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
  const repoActivities: RepoRollupActivity[] = [];

  if (parsed.compare) {
    const { baseRef, targetRef, range } = parseCompareRange(parsed.compare);
    const compareDateStr = `compare-${range.replace(/[/:\\]/g, "-")}`;

    const processCompareRepo = async (repo: typeof targetRepos[0]) => {
      try {
        const repoPath = await resolveRepoPath(repo.path);
        await fetchRemoteOrigin(repoPath);
        const effectiveRepo = await ConfigManager.mergeRepoWithLocalConfig(repo, repoPath);
        const repoName = await getRepoName(repoPath, effectiveRepo.repo_name);
        const prefix = `[${repoName}]`;

        console.log(`\n\x1b[1mComparing: [0m \x1b[36m${repoName}\x1b[0m (${repoPath}) [\x1b[35m${range}\x1b[0m]`);

        const activePrompt = await resolveRepoPrompt(
          config.prompt,
          effectiveRepo.custom_prompt,
          effectiveRepo.custom_prompt_file,
          repoPath,
        );

        const effectiveStyle = parsed.reportStyle || effectiveRepo.report_style || config.reportStyle || "default";

        const commits = await getCommitsBetweenRefs(repoPath, baseRef, targetRef);
        Logger.info(`${prefix} Found ${commits.length} commits between ${baseRef} and ${targetRef}.`);

        let diffStat;
        if (parsed.diffMode || effectiveRepo.diff_mode !== false) {
          diffStat = await fetchDiffStatBetweenRefs(repoPath, baseRef, targetRef, effectiveRepo.max_diff_lines, {
            smartDiffFilter: effectiveRepo.smart_diff_filter,
            diffIgnorePatterns: effectiveRepo.diff_ignore_patterns,
            filePriorities: config.filePriorities,
          });
        }

        const analysisContext = {
          repoName,
          repoPath,
          branches: [range],
          branch: range,
          dateStr: compareDateStr,
          commits,
          diffStat,
          customPrompt: activePrompt,
          basePrompt: config.prompt,
          reportStyle: effectiveStyle,
        };

        let reportMarkdown = "";
        let reportMeta;

        if (commits.length === 0 && (!diffStat || diffStat.filesChangedCount === 0)) {
          Logger.info(`${prefix} No commits or diffs found between ${baseRef} and ${targetRef} for ${repoName}. Generating empty report.`);
          const res = generateEmptyReport(analysisContext);
          reportMarkdown = res.markdown;
          reportMeta = res.meta;
        } else {
          Logger.info(`${prefix} Calling AI provider (${config.defaultProvider})...`);
          const provider = AIFactory.getProvider(config);
          const aiResult = await provider.analyze(analysisContext);
          const res = formatReportMarkdown(analysisContext, aiResult);
          reportMarkdown = res.markdown;
          reportMeta = res.meta;
        }

        const saved = await ReportStorage.saveReport(config.outputRoot, reportMeta, reportMarkdown);
        if (parsed.format && parsed.format !== "markdown") {
          const formatted = formatReport(reportMarkdown, reportMeta, parsed.format as OutputFormat);
          const formattedPath = saved.filePath.replace(/\.md$/, formatted.fileExtension);
          const { writeFile } = await import("node:fs/promises");
          await writeFile(formattedPath, formatted.content, "utf8");
          Logger.info(`${prefix} Formatted report (${parsed.format}) written to ${formattedPath}`);
        }
        const tokenInfo = reportMeta?.tokenUsage?.totalTokens
          ? ` (${reportMeta.tokenUsage.totalTokens.toLocaleString()} tokens)`
          : "";
        Logger.success(`${prefix} Comparison report for [${range}] written to ${saved.filePath}${tokenInfo}`);
      } catch (err) {
        await Logger.error(`Failed to generate comparison report for ${repo.path}`, err);
      }
    };

    await pooledMap(targetRepos, processCompareRepo, Math.min(4, targetRepos.length));

    if (config.retentionDays > 0) {
      const deleted = await ReportStorage.cleanExpiredReports(config.outputRoot, config.retentionDays);
      if (deleted.length > 0) {
        Logger.info(`Cleaned up ${deleted.length} expired report(s) (> ${config.retentionDays} days old).`);
      }
    }
    return;
  }


  const processRepo = async (repo: typeof targetRepos[0]): Promise<RepoRollupActivity | null> => {
    const repoCommits: import("./git/types.js").CommitRecord[] = [];
    let repoDiffStat: import("./git/types.js").DiffStat | undefined = undefined;
    try {
      const repoPath = await resolveRepoPath(repo.path);
      await fetchRemoteOrigin(repoPath);
      const effectiveRepo = await ConfigManager.mergeRepoWithLocalConfig(repo, repoPath);
      const repoName = await getRepoName(repoPath, effectiveRepo.repo_name);
      const branches = effectiveRepo.branches && effectiveRepo.branches.length > 0 ? effectiveRepo.branches : ["main"];
      const prefix = `[${repoName}]`;

      console.log(`\n\x1b[1mAnalyzing repo:\x1b[0m \x1b[36m${repoName}\x1b[0m (${repoPath}) [${branches.length} branch(es): ${branches.join(", ")}]`);

      const activePrompt = await resolveRepoPrompt(
        config.prompt,
        effectiveRepo.custom_prompt,
        effectiveRepo.custom_prompt_file,
        repoPath,
      );

      const effectiveStyle = parsed.reportStyle || effectiveRepo.report_style || config.reportStyle || "default";

      for (const branch of branches) {
        try {
          console.log(`\n  ${prefix} \x1b[1mBranch:\x1b[0m \x1b[35m${branch}\x1b[0m`);
          const commits = await fetchRepoCommits(repoPath, [branch], dateFilter);
          Logger.info(`${prefix} Found ${commits.length} commits on branch "${branch}".`);

          let diffStat;
          if ((parsed.diffMode || effectiveRepo.diff_mode !== false) && commits.length > 0) {
            diffStat = await fetchDiffStat(repoPath, [branch], dateFilter, effectiveRepo.max_diff_lines, {
              smartDiffFilter: effectiveRepo.smart_diff_filter,
              diffIgnorePatterns: effectiveRepo.diff_ignore_patterns,
              filePriorities: config.filePriorities,
            });
          }

          // Accumulate for multi-repo rollup
          for (const c of commits) {
            if (!repoCommits.some((existing) => existing.hash === c.hash)) {
              repoCommits.push(c);
            }
          }
          if (diffStat) {
            if (!repoDiffStat) {
              repoDiffStat = { ...diffStat, fileStats: [...diffStat.fileStats] };
            } else {
              repoDiffStat.filesChangedCount += diffStat.filesChangedCount;
              repoDiffStat.insertions += diffStat.insertions;
              repoDiffStat.deletions += diffStat.deletions;
              repoDiffStat.fileStats.push(...diffStat.fileStats);
            }
          }

          const analysisContext = {
            repoName,
            repoPath,
            branches: [branch],
            branch,
            dateStr,
            commits,
            diffStat,
            customPrompt: activePrompt,
            basePrompt: config.prompt,
            reportStyle: effectiveStyle,
          };

          let reportMarkdown = "";
          let reportMeta;

          if (commits.length === 0) {
            Logger.info(`${prefix} No commits found for ${repoName} on branch "${branch}". Generating empty report.`);
            const res = generateEmptyReport(analysisContext);
            reportMarkdown = res.markdown;
            reportMeta = res.meta;
          } else {
            Logger.info(`${prefix} Calling AI provider (${config.defaultProvider})...`);
            const provider = AIFactory.getProvider(config);
            const aiResult = await provider.analyze(analysisContext);
            const res = formatReportMarkdown(analysisContext, aiResult);
            reportMarkdown = res.markdown;
            reportMeta = res.meta;
          }

          const saved = await ReportStorage.saveReport(config.outputRoot, reportMeta, reportMarkdown);
          if (parsed.format && parsed.format !== "markdown") {
            const formatted = formatReport(reportMarkdown, reportMeta, parsed.format as OutputFormat);
            const formattedPath = saved.filePath.replace(/\.md$/, formatted.fileExtension);
            const { writeFile } = await import("node:fs/promises");
            await writeFile(formattedPath, formatted.content, "utf8");
            Logger.info(`${prefix} Formatted report (${parsed.format}) written to ${formattedPath}`);
          }
          const tokenInfo = reportMeta?.tokenUsage?.totalTokens
            ? ` (${reportMeta.tokenUsage.totalTokens.toLocaleString()} tokens)`
            : "";
          Logger.success(`${prefix} Report for [${branch}] written to ${saved.filePath}${tokenInfo}`);
        } catch (branchErr) {
          await Logger.error(`Failed to generate report for ${repo.path} on branch ${branch}`, branchErr);
        }
      }

      return {
        repoName,
        repoPath,
        branches,
        commits: repoCommits,
        diffStat: repoDiffStat,
      };
    } catch (err) {
      await Logger.error(`Failed to generate report for ${repo.path}`, err);
      return null;
    }
  };

  const results = await pooledMap(targetRepos, processRepo, Math.min(4, targetRepos.length));

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      repoActivities.push(result.value);
    }
  }

  // Generate multi-repo workspace rollup if requested
  if (parsed.rollup) {
    try {
      console.log(`\n\x1b[1m\x1b[36mGenerating Workspace Multi-Repo Rollup Digest...\x1b[0m`);
      const totalRollupCommits = repoActivities.reduce((acc, r) => acc + r.commits.length, 0);
      const rollupContext: MultiRepoRollupContext = {
        workspaceName: "Workspace Rollup",
        dateStr,
        repos: repoActivities,
        basePrompt: config.prompt,
        customPrompt: null,
        reportStyle: parsed.reportStyle || config.reportStyle || "default",
      };

      let rollupMarkdown = "";
      let rollupMeta: ReportMeta;

      if (totalRollupCommits === 0) {
        Logger.info(`No commits found across ${repoActivities.length} repositories. Generating empty workspace rollup report.`);
        const res = generateEmptyWorkspaceRollup(rollupContext);
        rollupMarkdown = res.markdown;
        rollupMeta = res.meta;
      } else {
        Logger.info(`Calling AI provider (${config.defaultProvider}) for workspace rollup...`);
        const provider = AIFactory.getProvider(config);
        let aiResult: AnalysisResult;
        if (typeof provider.analyzeMultiRepo === "function") {
          aiResult = await provider.analyzeMultiRepo(rollupContext);
        } else if (typeof provider.generate === "function") {
          const prompt = buildMultiRepoRollupPrompt(rollupContext);
          const content = await provider.generate(prompt);
          aiResult = { content, providerLabel: provider.id, rawResult: content };
        } else {
          const prompt = buildMultiRepoRollupPrompt(rollupContext);
          aiResult = await provider.analyze({
            repoName: "_workspace",
            repoPath: process.cwd(),
            branches: rollupContext.repos.flatMap((r) => r.branches),
            branch: "rollup",
            dateStr,
            commits: rollupContext.repos.flatMap((r) => r.commits),
            basePrompt: prompt,
            customPrompt: prompt,
            reportStyle: rollupContext.reportStyle,
          });
        }

        const res = formatWorkspaceRollupMarkdown(rollupContext, aiResult);
        rollupMarkdown = res.markdown;
        rollupMeta = res.meta;
      }

      const saved = await ReportStorage.saveWorkspaceRollup(config.outputRoot, rollupMeta, rollupMarkdown);
      if (parsed.format && parsed.format !== "markdown") {
        const formatted = formatReport(rollupMarkdown, rollupMeta, parsed.format as OutputFormat);
        const formattedPath = saved.filePath.replace(/\.md$/, formatted.fileExtension);
        const { writeFile } = await import("node:fs/promises");
        await writeFile(formattedPath, formatted.content, "utf8");
        Logger.info(`Formatted workspace rollup report (${parsed.format}) written to ${formattedPath}`);
      }
      const tokenInfo = rollupMeta?.tokenUsage?.totalTokens
        ? ` (${rollupMeta.tokenUsage.totalTokens.toLocaleString()} tokens)`
        : "";
      Logger.success(`Workspace rollup report written to ${saved.filePath}${tokenInfo}`);
    } catch (rollupErr) {
      await Logger.error("Failed to generate workspace multi-repo rollup report", rollupErr);
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
  installTerminalGuard();
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
      expiresAt = getLocalDaysAheadString(parsed.expireDays);
    }

    const frequency: ScheduleFrequency =
      parsed.scheduleFrequency ||
      (parsed.scheduleCron ? "custom" : parsed.scheduleDays ? "custom_days" : "daily");

    const schedConfig: ScheduleConfig = {
      frequency,
      time,
      cronExpression: parsed.scheduleCron,
      daysOfWeek: parsed.scheduleDays,
      intervalHours: parsed.intervalHours,
      configPath: parsed.configPath,
      expiresAt,
      expireDays: parsed.expireDays,
    };

    const summaryDesc = formatScheduleSummary(schedConfig);
    const expMsg = expiresAt ? ` (expires: ${expiresAt})` : "";

    if (LaunchdScheduler.isMacOS()) {
      await LaunchdScheduler.install(schedConfig);
      Logger.success(`macOS LaunchAgent installed: ${summaryDesc}${expMsg}`);
    } else {
      await CronScheduler.install(schedConfig);
      Logger.success(`Crontab installed: ${summaryDesc}${expMsg}`);
    }
    return;
  }

  if (parsed.ui) {
    const config = await ConfigManager.load(parsed.configPath);
    if (parsed.outputRoot) {
      config.outputRoot = resolve(parsed.outputRoot);
    }
    let activeRepo: string | null = null;
    if (await isGitRepo(process.cwd())) {
      activeRepo = await getRepoName(process.cwd());
    }

    const server = new IngestWebServer({
      port: parsed.port || 3456,
      outputRoot: config.outputRoot,
      activeRepo,
      openBrowser: !parsed.noOpen,
    });

    const info = await server.start();

    console.log(`\n${ANSI.bold}${ANSI.brightCyan}⚡ Ingest Web UI Dashboard${ANSI.reset}`);
    console.log(`  ${ANSI.green}✔ Web server running at:${ANSI.reset} ${ANSI.bold}${ANSI.underline}${info.url}${ANSI.reset}`);
    console.log(`  ${ANSI.dim}📁 Shared report store:${ANSI.reset}  ${info.outputRoot}`);
    if (info.activeRepo) {
      console.log(`  ${ANSI.dim}⎇ Active repository:${ANSI.reset}    ${ANSI.cyan}${info.activeRepo}${ANSI.reset}`);
    }
    console.log(`\n  ${ANSI.dim}Press Ctrl+C to stop server${ANSI.reset}\n`);

    let isShuttingDown = false;
    await new Promise<void>((resolvePromise) => {
      const shutdown = async () => {
        if (isShuttingDown) {
          process.exit(0);
        }
        isShuttingDown = true;
        console.log(`\n${ANSI.yellow}Shutting down Ingest Web UI...${ANSI.reset}`);
        try {
          await server.stop();
        } catch {
          // ignore already closed
        }
        resolvePromise();
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
    return;
  }

  if (parsed.viewFile) {
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(parsed.viewFile, "utf8");
    await showTerminalPager(content, parsed.viewFile.split("/").pop() || "Report");
    return;
  }

  if (parsed.fixDiagramFile) {
    const { readFile, writeFile } = await import("node:fs/promises");
    const { repairReportMarkdown } = await import("./ai/repair.js");
    const filePath = resolve(parsed.fixDiagramFile);
    Logger.info(`Inspecting Mermaid diagrams in ${filePath}...`);
    const content = await readFile(filePath, "utf8");
    const config = await ConfigManager.load(parsed.configPath);
    const provider = AIFactory.getProvider(config);
    const result = await repairReportMarkdown(content, provider);
    await writeFile(filePath, result.repairedMarkdown, "utf8");
    Logger.success(`Repaired ${result.repairedCount} Mermaid diagram(s) in ${filePath}`);
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

// Execute CLI
main().catch(async (err) => {
  await Logger.error("Unexpected runtime failure", err);
  process.exit(1);
});
