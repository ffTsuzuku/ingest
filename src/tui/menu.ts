import { resolve } from "node:path";
import { ANSI, drawBox } from "./ansi.js";
import { promptMultiSelect, promptSelect, promptText } from "./prompt.js";
import { showTerminalPager } from "./pager.js";
import { ConfigManager } from "../config/manager.js";
import type { AppConfig, RepoConfig } from "../config/types.js";
import type { ReportSummary } from "../report/types.js";
import { isGitRepo, getCurrentBranch, resolveRepoPath, getGitBranches, getRepoName, fetchRemoteOrigin } from "../git/runner.js";
import { fetchRepoCommits, resolveDateFilter } from "../git/log.js";
import { fetchDiffStat } from "../git/diff.js";
import { AIFactory } from "../ai/factory.js";
import { resolveRepoPrompt } from "../ai/prompt.js";
import { formatReportMarkdown, generateEmptyReport } from "../report/generator.js";
import { ReportStorage } from "../report/storage.js";
import { renderMarkdownToAnsi, renderReportFileToAnsi } from "../report/viewer.js";
import { CronScheduler } from "../scheduler/cron.js";
import { LaunchdScheduler } from "../scheduler/launchd.js";
import { renderScheduleStatusBox } from "../scheduler/status.js";
import type { ScheduleConfig } from "../scheduler/types.js";
import { formatScheduleSummary } from "../scheduler/helpers.js";
import { SkillInstaller } from "../skill/installer.js";
import { ConfigInitWizard } from "../config/init.js";
import { IngestWebServer } from "../server/server.js";
import { HarnessDiscovery } from "../ai/discovery.js";
import { Logger } from "../utils/logger.js";
import { getLocalDateString, getLocalDaysAgoString, getLocalDaysAheadString } from "../utils/date.js";

export interface MenuContext {
  config: AppConfig;
  currentRepoPath?: string;
  isCurrentDirRepo: boolean;
}

export class InteractiveTUI {
  public static async run(customConfigPath?: string): Promise<void> {
    const config = await ConfigManager.load(customConfigPath);
    const cwd = process.cwd();
    const isCurrentDirRepo = await isGitRepo(cwd);

    const ctx: MenuContext = {
      config,
      currentRepoPath: isCurrentDirRepo ? cwd : undefined,
      isCurrentDirRepo,
    };

    while (true) {
      console.clear();
      this.printBanner();

      if (ctx.isCurrentDirRepo) {
        console.log(`  ${ANSI.dim} Current Directory is a Git Repo:${ANSI.reset} ${ANSI.cyan}${cwd}${ANSI.reset}\n`);
      }

      const choices = [
        {
          label: " Generate Git Report (Daily / Custom Date)",
          value: "generate",
          hint: "Single repo or all configured repositories",
        },
        {
          label: " View Historical Reports (Markdown Explorer)",
          value: "view",
          hint: "Browse past summaries in styled terminal pager",
        },
        {
          label: "🌐 Launch Ingest Web UI Dashboard (--ui)",
          value: "ui",
          hint: "Open responsive web browser report explorer",
        },
        {
          label: " Scheduler Automation Wizard (Launchd / Cron)",
          value: "schedule",
          hint: "Setup or manage automated report runs",
        },
        {
          label: " Repo Settings & Custom Prompts",
          value: "settings",
          hint: "Configure monitored repos and custom prompt templates",
        },
        {
          label: " Install Global AI Agent Skill",
          value: "skill",
          hint: "Deploy skill to ~/.gemini/config/skills/ingest/",
        },
        {
          label: " Test AI Provider Connection",
          value: "test-ai",
          hint: "Verify Antigravity (agy) / Opencode CLI integration",
        },
        {
          label: "⚙️ Run Configuration Setup Wizard (--init)",
          value: "init",
          hint: "Initialize local .ingestrc or global config with guided setup",
        },
        {
          label: " Exit",
          value: "exit",
        },
      ];

      const action = await promptSelect({
        message: "Select an action:",
        choices,
      });

      if (!action || action === "exit") {
        console.log(`\n${ANSI.gray}Goodbye! ${ANSI.reset}\n`);
        break;
      }

      try {
        switch (action) {
          case "generate":
            await this.handleGenerateReport(ctx);
            break;
          case "view":
            await this.handleViewReports(ctx);
            break;
          case "ui":
            await this.handleLaunchWebUI(ctx);
            break;
          case "schedule":
            await this.handleSchedulerWizard(ctx);
            break;
          case "settings":
            await this.handleRepoSettings(ctx);
            break;
          case "skill":
            await this.handleInstallSkill();
            break;
          case "test-ai":
            await this.handleTestAI(ctx);
            break;
          case "init":
            await ConfigInitWizard.run({ cwd: ctx.currentRepoPath || process.cwd() });
            ctx.config = await ConfigManager.load(customConfigPath);
            break;
        }
      } catch (err) {
        await Logger.error("Interactive action failed", err);
      }
    }
  }

  private static printBanner(): void {
    const bannerLines = [
      `${ANSI.bold}${ANSI.brightCyan}INGEST${ANSI.reset} ${ANSI.gray}- AI Daily Report Generator & Git Intelligence${ANSI.reset}`,
      `${ANSI.dim}Zero-Dependency TUI | Deep-Dive Diffs | Auto-Scheduler | Global AI Skill${ANSI.reset}`,
    ];
    const boxWidth = Math.max(40, Math.min(76, (process.stdout.columns || 80) - 2));
    console.log(drawBox(" ingest", bannerLines, boxWidth).join("\n"));
    console.log("");
  }

  private static async handleGenerateReport(ctx: MenuContext): Promise<void> {
    console.log(`\n${ANSI.bold}${ANSI.yellow}=== Generate Git Report ===${ANSI.reset}\n`);

    let targetRepos: Array<RepoConfig & { repo_name: string | null; branches: string[] }> = [];

    if (ctx.isCurrentDirRepo && ctx.currentRepoPath) {
      const found = ctx.config.repos.find((r) => r.path === ctx.currentRepoPath);
      let baseRepo: RepoConfig = found || {
        path: ctx.currentRepoPath,
        repo_name: null,
        branches: (await getGitBranches(ctx.currentRepoPath)).slice(0, 2),
      };
      if (!baseRepo.branches || baseRepo.branches.length === 0) baseRepo.branches = ["main"];
      targetRepos = [await ConfigManager.mergeRepoWithLocalConfig(baseRepo, ctx.currentRepoPath)];
    } else if (ctx.config.repos.length === 1) {
      const singleRepo = ctx.config.repos[0]!;
      targetRepos = [await ConfigManager.mergeRepoWithLocalConfig(singleRepo, singleRepo.path)];
    } else if (ctx.config.repos.length > 1) {
      const repoChoices: Array<{ label: string; value: string }> = [];
      for (const repo of ctx.config.repos) {
        const name = await getRepoName(repo.path, repo.repo_name);
        repoChoices.push({
          label: ` ${name} (${repo.path})`,
          value: repo.path,
        });
      }

      repoChoices.push({
        label: " All Configured Repositories",
        value: "__all__",
      });

      repoChoices.push({
        label: " Back",
        value: "__back__",
      });

      const selectedTarget = await promptSelect({
        message: "Which repository would you like to analyze?",
        choices: repoChoices,
      });

      if (!selectedTarget || selectedTarget === "__back__") {
        return;
      }

      if (selectedTarget === "__all__") {
        targetRepos = ctx.config.repos;
      } else {
        const found = ctx.config.repos.find((r) => r.path === selectedTarget);
        let baseRepo: RepoConfig = found || {
          path: selectedTarget,
          repo_name: null,
          branches: (await getGitBranches(selectedTarget)).slice(0, 2),
        };
        if (!baseRepo.branches || baseRepo.branches.length === 0) baseRepo.branches = ["main"];
        targetRepos = [await ConfigManager.mergeRepoWithLocalConfig(baseRepo, selectedTarget)];
      }
    } else {
      Logger.warn("No git repositories found in configuration, local .ingestrc, or current directory.");
      return;
    }

    // Select Date filter
    const dateChoice = await promptSelect({
      message: "Select reporting time window:",
      choices: [
        { label: " Last 24 Hours (Default)", value: "24h" },
        { label: " Today (from 00:00 local time)", value: "today" },
        { label: " Custom Specific Date (YYYY-MM-DD)", value: "custom_date" },
        { label: " Custom Date Range (YYYY-MM-DD to YYYY-MM-DD)", value: "date_range" },
        { label: " Last 7 Days", value: "7d" },
        { label: " Last 30 Days", value: "30d" },
        { label: " Back", value: "__back__" },
      ],
    });

    if (!dateChoice || dateChoice === "__back__") {
      return;
    }

    const todayStr = getLocalDateString();
    let dateStr = todayStr;
    const dateFilter: { since?: string; until?: string; sinceHours?: number } = {};

    if (dateChoice === "24h") {
      dateFilter.sinceHours = 24;
      dateStr = todayStr;
    } else if (dateChoice === "today") {
      dateFilter.since = `${todayStr} 00:00:00`;
      dateFilter.until = `${todayStr} 23:59:59`;
      dateStr = todayStr;
    } else if (dateChoice === "custom_date") {
      const customDateStr = await promptText({
        message: "Enter date (YYYY-MM-DD):",
        defaultValue: todayStr,
      });
      if (!customDateStr) return;
      const resolved = resolveDateFilter({ dateStr: customDateStr });
      dateFilter.since = resolved.dateFilter.since;
      dateFilter.until = resolved.dateFilter.until;
      dateStr = resolved.reportDateStr;
    } else if (dateChoice === "date_range") {
      const defaultStart = getLocalDaysAgoString(7);
      const startDateInput = await promptText({
        message: "Enter start date (YYYY-MM-DD):",
        defaultValue: defaultStart,
      });
      if (!startDateInput) return;

      const endDateInput = await promptText({
        message: "Enter end date (YYYY-MM-DD):",
        defaultValue: todayStr,
      });
      if (!endDateInput) return;

      let start = startDateInput.trim();
      let end = endDateInput.trim();
      if (start > end) {
        [start, end] = [end, start];
      }
      dateFilter.since = `${start} 00:00:00`;
      dateFilter.until = `${end} 23:59:59`;
      dateStr = `${start}-to-${end}`;
    } else if (dateChoice === "7d") {
      const start = getLocalDaysAgoString(7);
      dateFilter.since = `${start} 00:00:00`;
      dateFilter.until = `${todayStr} 23:59:59`;
      dateStr = `${start}-to-${todayStr}`;
    } else if (dateChoice === "30d") {
      const start = getLocalDaysAgoString(30);
      dateFilter.since = `${start} 00:00:00`;
      dateFilter.until = `${todayStr} 23:59:59`;
      dateStr = `${start}-to-${todayStr}`;
    }

    const diffChoice = await promptSelect({
      message: "Select analysis depth:",
      choices: [
        { label: " Diff Deep-Dive (Inspect code diff stats & file changes)", value: "deep", hint: "Recommended" },
        { label: " Standard Log (Commit messages & metadata only)", value: "standard" },
        { label: " Back", value: "__back__" },
      ],
    });

    if (!diffChoice || diffChoice === "__back__") {
      return;
    }

    const diffDeepDive = diffChoice === "deep";

    console.log(`\n${ANSI.cyan}Analyzing repositories...${ANSI.reset}`);

    for (const repo of targetRepos) {
      const repoPath = await resolveRepoPath(repo.path);
      await fetchRemoteOrigin(repoPath);
      const effectiveRepo = await ConfigManager.mergeRepoWithLocalConfig(repo, repoPath);
      const repoName = await getRepoName(repoPath, effectiveRepo.repo_name);
      const branches = effectiveRepo.branches && effectiveRepo.branches.length > 0 ? effectiveRepo.branches : ["main"];

      console.log(`\n${ANSI.bold}Processing:${ANSI.reset} ${ANSI.cyan}${repoName}${ANSI.reset} (${repoPath}) [${branches.length} branch(es): ${branches.join(", ")}]`);

      const activePrompt = await resolveRepoPrompt(
        ctx.config.prompt,
        effectiveRepo.custom_prompt,
        effectiveRepo.custom_prompt_file,
        repoPath,
      );

      const effectiveStyle = effectiveRepo.report_style || ctx.config.reportStyle || "default";

      for (const branch of branches) {
        console.log(`\n  ${ANSI.bold}Branch:${ANSI.reset} ${ANSI.magenta}${branch}${ANSI.reset}`);
        const commits = await fetchRepoCommits(repoPath, [branch], dateFilter);
        console.log(`  Found ${ANSI.green}${commits.length}${ANSI.reset} commits on branch "${branch}".`);

        let diffStat;
        if (diffDeepDive && commits.length > 0) {
          diffStat = await fetchDiffStat(repoPath, [branch], dateFilter, effectiveRepo.max_diff_lines, {
            smartDiffFilter: effectiveRepo.smart_diff_filter,
            diffIgnorePatterns: effectiveRepo.diff_ignore_patterns,
            filePriorities: ctx.config.filePriorities,
          });
          if (diffStat) {
            console.log(`  Diff Stat: ${diffStat.filesChangedCount} files changed (+${diffStat.insertions}, -${diffStat.deletions}).`);
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
          basePrompt: ctx.config.prompt,
          reportStyle: effectiveStyle,
        };

        let reportMarkdown = "";
        let reportMeta;

        if (commits.length === 0) {
          console.log(`  ${ANSI.yellow}No commits found on branch "${branch}". Generating empty report.${ANSI.reset}`);
          const res = generateEmptyReport(analysisContext);
          reportMarkdown = res.markdown;
          reportMeta = res.meta;
        } else {
          console.log(`  ${ANSI.magenta} Calling AI Provider (${ctx.config.defaultProvider})...${ANSI.reset}`);
          const provider = AIFactory.getProvider(ctx.config);
          const aiResult = await provider.analyze(analysisContext);
          const res = formatReportMarkdown(analysisContext, aiResult);
          reportMarkdown = res.markdown;
          reportMeta = res.meta;
        }

        const saved = await ReportStorage.saveReport(ctx.config.outputRoot, reportMeta, reportMarkdown);
        const tokenInfo = reportMeta?.tokenUsage?.totalTokens
          ? ` ${ANSI.magenta}[⚡ ${reportMeta.tokenUsage.totalTokens.toLocaleString()} tokens]${ANSI.reset}`
          : "";
        console.log(`  ${ANSI.green}✔ Report saved to:${ANSI.reset} ${saved.filePath}${tokenInfo}`);

        await showTerminalPager(reportMarkdown, `${repoName} (${branch}) - ${dateStr}`);
      }

      if (ctx.config.retentionDays > 0) {
        const deleted = await ReportStorage.cleanExpiredReports(ctx.config.outputRoot, ctx.config.retentionDays);
        if (deleted.length > 0) {
          console.log(`  ${ANSI.dim}Auto-cleaned ${deleted.length} expired report(s) (> ${ctx.config.retentionDays} days old).${ANSI.reset}`);
        }
      }
    }
  }

  private static async handleViewReports(ctx: MenuContext): Promise<void> {
    while (true) {
      console.log(`\n${ANSI.bold}${ANSI.yellow}=== Report Explorer & Viewer ===${ANSI.reset}\n`);

      const allReports = await ReportStorage.listReports(ctx.config.outputRoot);
      if (allReports.length === 0) {
        console.log(`  ${ANSI.yellow}No reports found in ${ctx.config.outputRoot}.${ANSI.reset}`);
        return;
      }

      const repoMap = ReportStorage.groupReportsByRepo(allReports);
      const repoEntries = Array.from(repoMap.entries());

      // Sort repositories: workspace rollups first, then alphabetically
      repoEntries.sort(([a], [b]) => {
        if (a === "_workspace") return -1;
        if (b === "_workspace") return 1;
        return a.localeCompare(b);
      });

      const choices: Array<{ label: string; value: string; hint?: string }> = [];

      // Global all reports option
      choices.push({
        label: `📑 All Historical Reports (${allReports.length} total)`,
        value: "repo:__all__",
        hint: "Browse and auto-filter all historical reports across all repos",
      });

      // Repository choices
      for (const [repoName, repoReports] of repoEntries) {
        const latest = repoReports[0];
        const latestDateStr = latest?.dateStr ?? "N/A";
        const countLabel = `${repoReports.length} ${repoReports.length === 1 ? "report" : "reports"}`;

        if (repoName === "_workspace") {
          choices.push({
            label: `🌐 _workspace Rollups (${countLabel})`,
            value: `repo:${repoName}`,
            hint: `Latest: ${latestDateStr}`,
          });
        } else {
          choices.push({
            label: `📦 ${repoName} (${countLabel})`,
            value: `repo:${repoName}`,
            hint: `Latest: ${latestDateStr}`,
          });
        }
      }

      choices.push({
        label: " Back",
        value: "__back__",
        hint: "Return to main menu",
      });

      console.log(`  ${ANSI.dim}Central Report Store:${ANSI.reset} ${ANSI.cyan}${ctx.config.outputRoot}${ANSI.reset}`);
      console.log(`  ${ANSI.dim}Total Reports:${ANSI.reset}        ${ANSI.bold}${ANSI.green}${allReports.length}${ANSI.reset} across ${repoEntries.length} target(s)\n`);

      const action = await promptSelect({
        message: "Select a repository to explore (type anytime to filter):",
        choices,
        pageSize: 12,
      });

      if (!action || action === "__back__") {
        return;
      }

      if (action.startsWith("repo:")) {
        const repoName = action.slice(5);
        const repoReports = repoName === "__all__" ? allReports : (repoMap.get(repoName) || []);
        await this.handleRepoReportsView(ctx, repoName, repoReports);
      }
    }
  }

  private static async handleRepoReportsView(
    ctx: MenuContext,
    repoName: string,
    _initialReports: ReportSummary[],
  ): Promise<void> {
    const isAll = repoName === "__all__" || repoName === "All Repositories";
    const isWorkspace = repoName === "_workspace";
    const icon = isAll ? "📑" : isWorkspace ? "🌐" : "📦";
    const title = isAll ? "All Historical Reports" : isWorkspace ? "_workspace Rollups" : repoName;

    while (true) {
      const currentReports = isAll
        ? await ReportStorage.listReports(ctx.config.outputRoot)
        : await ReportStorage.listReports(ctx.config.outputRoot, repoName);

      if (currentReports.length === 0) {
        console.log(`\n  ${ANSI.yellow}No reports found for ${title}.${ANSI.reset}\n`);
        return;
      }

      console.log(`\n${ANSI.bold}${ANSI.yellow}=== ${icon} ${title} ===${ANSI.reset}\n`);
      const countDisplay = `${currentReports.length} reports in ${title}`;
      console.log(`  ${ANSI.dim}${countDisplay}${ANSI.reset}\n`);

      const choices: Array<{ label: string; value: string; hint?: string }> = [];

      for (const r of currentReports) {
        const styleSuffix = r.reportStyle ? ` (${r.reportStyle})` : "";
        const branchSuffix = r.branch ? ` [ ${r.branch}]` : "";
        const repoPrefix = isAll ? `${r.repoName} - ` : "";
        const tokenHint = r.tokenUsage?.totalTokens
          ? ` | ⚡ ${(r.tokenUsage.totalTokens >= 1000 ? `${(r.tokenUsage.totalTokens / 1000).toFixed(1)}k` : r.tokenUsage.totalTokens)} tok`
          : "";

        choices.push({
          label: ` ${repoPrefix}${r.dateStr}${branchSuffix}${styleSuffix}`,
          value: `report:${r.filePath}`,
          hint: `${(r.sizeBytes / 1024).toFixed(1)} KB${tokenHint}`,
        });
      }

      if (currentReports.length > 0) {
        choices.push({
          label: "🗑️ Delete Report(s) (Batch Select)",
          value: "__batch_delete__",
          hint: "Select multiple reports to remove",
        });
      }

      choices.push({
        label: " Back",
        value: "__back__",
        hint: "Return to repository list",
      });

      const chosen = await promptSelect({
        message: `Select a report in ${title} (type to filter):`,
        choices,
        pageSize: 12,
      });

      if (!chosen || chosen === "__back__") {
        return;
      }

      if (chosen === "__batch_delete__") {
        const deleteChoices = currentReports.map((r) => {
          const styleSuffix = r.reportStyle ? ` (${r.reportStyle})` : "";
          const branchSuffix = r.branch ? ` [ ${r.branch}]` : "";
          const repoPrefix = isAll ? `${r.repoName} - ` : "";
          return {
            label: `${repoPrefix}${r.dateStr}${branchSuffix}${styleSuffix} (${r.fileName})`,
            value: r.filePath,
            selected: false,
          };
        });

        const selectedPaths = await promptMultiSelect<string>({
          message: "Select reports to delete (<Space> to toggle, <Enter> to confirm):",
          choices: deleteChoices,
          allowCustomInput: false,
        });

        if (selectedPaths && selectedPaths.length > 0) {
          const confirmChoice = await promptSelect({
            message: `Are you sure you want to permanently delete ${selectedPaths.length} selected report(s)?`,
            choices: [
              { label: `🗑️ Yes, delete ${selectedPaths.length} report(s)`, value: "confirm" },
              { label: " Cancel", value: "cancel" },
            ],
          });

          if (confirmChoice === "confirm") {
            let deletedCount = 0;
            for (const p of selectedPaths) {
              const ok = await ReportStorage.deleteReport(p);
              if (ok) deletedCount++;
            }
            Logger.success(`Successfully deleted ${deletedCount} report(s).`);
          }
        }
        continue;
      }

      if (chosen.startsWith("report:")) {
        const filePath = chosen.slice(7);
        const fileName = filePath.split("/").pop() || "Report";

        const reportAction = await promptSelect({
          message: `Report action for ${fileName}:`,
          choices: [
            { label: " View Report in Terminal Pager", value: "view", hint: "Open interactive scrollable pager" },
            { label: "🗑️ Delete Report", value: "delete", hint: "Permanently remove this report file" },
            { label: " Back", value: "__back__" },
          ],
        });

        if (!reportAction || reportAction === "__back__") {
          continue;
        }

        if (reportAction === "view") {
          const { readFile } = await import("node:fs/promises");
          try {
            const content = await readFile(filePath, "utf8");
            await showTerminalPager(content, fileName);
          } catch {
            Logger.warn(`Failed to read report file: ${filePath}`);
          }
        } else if (reportAction === "delete") {
          const confirmChoice = await promptSelect({
            message: `Are you sure you want to permanently delete "${fileName}"?`,
            choices: [
              { label: "🗑️ Yes, delete this report", value: "confirm" },
              { label: " Cancel", value: "cancel" },
            ],
          });

          if (confirmChoice === "confirm") {
            const ok = await ReportStorage.deleteReport(filePath);
            if (ok) {
              Logger.success(`Report "${fileName}" deleted successfully.`);
            } else {
              Logger.error(`Failed to delete report "${fileName}".`);
            }
          }
        }
      }
    }
  }

  private static async handleSchedulerWizard(ctx: MenuContext): Promise<void> {
    while (true) {
      console.log(`\n${ANSI.bold}${ANSI.yellow}=== Scheduler Wizard ===${ANSI.reset}\n`);

      const isMac = LaunchdScheduler.isMacOS();
      const statusBox = await renderScheduleStatusBox();
      console.log(statusBox + "\n");

      const choices = [
        { label: " Install / Update Automated Report Schedule", value: "install" },
        { label: " Remove / Disable Automated Schedules", value: "uninstall" },
        { label: " Back", value: "back" },
      ];

      const action = await promptSelect({
        message: "Select schedule operation:",
        choices,
      });

      if (!action || action === "back") return;

      if (action === "uninstall") {
        await CronScheduler.uninstall();
        if (isMac) await LaunchdScheduler.uninstall();
        Logger.success("Automated schedules successfully removed.");
        return;
      }

      if (action === "install") {
        const targetEngine = isMac
          ? await promptSelect({
              message: "Select automation engine:",
              choices: [
                { label: " macOS LaunchAgent (Recommended for Mac)", value: "launchd" },
                { label: " Standard Crontab", value: "cron" },
                { label: " Back", value: "back" },
              ],
            })
          : "cron";

        if (!targetEngine || targetEngine === "back") continue;

        const patternChoice = await promptSelect({
          message: "Select schedule pattern:",
          choices: [
            { label: " Daily (Everyday)", value: "daily", hint: "Every day at specified HH:MM" },
            { label: " Weekdays (Mon-Fri)", value: "weekdays", hint: "Monday through Friday at HH:MM" },
            { label: "🏖️ Weekends (Sat-Sun)", value: "weekends", hint: "Saturday & Sunday at HH:MM" },
            { label: " Specific Days of the Week", value: "custom_days", hint: "Select custom days (e.g. Mon, Wed, Fri)" },
            { label: " Hourly", value: "hourly", hint: "Every hour or every N hours" },
            { label: " Custom Cron Expression", value: "custom", hint: "e.g. 30 9 * * 1-5 or 0 */3 * * *" },
            { label: " Back", value: "back" },
          ],
        });

        if (!patternChoice || patternChoice === "back") continue;

        let schedConfig: ScheduleConfig;

        if (patternChoice === "daily") {
          const timeInput = await promptText({
            message: "Enter run time in 24-hour format (HH:MM):",
            defaultValue: "00:00",
          });
          if (!timeInput) continue;
          schedConfig = {
            frequency: "daily",
            time: timeInput.trim(),
            configPath: ctx.config.configPath,
          };
        } else if (patternChoice === "weekdays") {
          const timeInput = await promptText({
            message: "Enter run time on weekdays in 24-hour format (HH:MM):",
            defaultValue: "18:00",
          });
          if (!timeInput) continue;
          schedConfig = {
            frequency: "weekdays",
            time: timeInput.trim(),
            daysOfWeek: [1, 2, 3, 4, 5],
            configPath: ctx.config.configPath,
          };
        } else if (patternChoice === "weekends") {
          const timeInput = await promptText({
            message: "Enter run time on weekends in 24-hour format (HH:MM):",
            defaultValue: "10:00",
          });
          if (!timeInput) continue;
          schedConfig = {
            frequency: "weekends",
            time: timeInput.trim(),
            daysOfWeek: [6, 7],
            configPath: ctx.config.configPath,
          };
        } else if (patternChoice === "custom_days") {
          const selectedDays = await promptMultiSelect<number>({
            message: "Select days of the week:",
            choices: [
              { label: "Monday", value: 1, selected: true },
              { label: "Tuesday", value: 2, selected: true },
              { label: "Wednesday", value: 3, selected: true },
              { label: "Thursday", value: 4, selected: true },
              { label: "Friday", value: 5, selected: true },
              { label: "Saturday", value: 6, selected: false },
              { label: "Sunday", value: 7, selected: false },
            ],
            allowCustomInput: false,
          });
          if (!selectedDays || selectedDays.length === 0) continue;

          const timeInput = await promptText({
            message: "Enter run time in 24-hour format (HH:MM):",
            defaultValue: "18:00",
          });
          if (!timeInput) continue;

          schedConfig = {
            frequency: "custom_days",
            time: timeInput.trim(),
            daysOfWeek: selectedDays,
            configPath: ctx.config.configPath,
          };
        } else if (patternChoice === "hourly") {
          const hourlyChoice = await promptSelect({
            message: "Select hourly interval:",
            choices: [
              { label: "Every hour (at minute :00)", value: "1" },
              { label: "Every 2 hours", value: "2" },
              { label: "Every 3 hours", value: "3" },
              { label: "Every 4 hours", value: "4" },
              { label: "Every 6 hours", value: "6" },
              { label: "Every 12 hours", value: "12" },
              { label: "Custom hour interval", value: "custom" },
              { label: " Back", value: "back" },
            ],
          });
          if (!hourlyChoice || hourlyChoice === "back") continue;

          let interval = parseInt(hourlyChoice, 10);
          if (hourlyChoice === "custom") {
            const customInterval = await promptText({
              message: "Enter interval in hours (1-23):",
              defaultValue: "2",
            });
            if (!customInterval) continue;
            interval = Math.max(1, parseInt(customInterval, 10) || 1);
          }

          const minuteInput = await promptText({
            message: "Enter minute of the hour (0-59):",
            defaultValue: "00",
          });
          if (minuteInput === null) continue;
          const minPad = (minuteInput.trim() || "00").padStart(2, "0");

          schedConfig = {
            frequency: "hourly",
            intervalHours: interval,
            time: `00:${minPad}`,
            configPath: ctx.config.configPath,
          };
        } else {
          // custom cron expression
          const exprInput = await promptText({
            message: "Enter 5-field Cron Expression (e.g. 30 9 * * 1-5 or 0 */3 * * *):",
            defaultValue: "0 0 * * *",
          });
          if (!exprInput) continue;
          schedConfig = {
            frequency: "custom",
            cronExpression: exprInput.trim(),
            configPath: ctx.config.configPath,
          };
        }

        const expireChoice = await promptSelect({
          message: "Set automated schedule expiration period?",
          choices: [
            { label: "♾️  Permanent / Indefinite (No expiration)", value: "none" },
            { label: "⏱️  7 Days (1-week sprint / trial)", value: "7d" },
            { label: "⏱️  14 Days (2-week sprint cycle)", value: "14d" },
            { label: "⏱️  30 Days (1-month period)", value: "30d" },
            { label: "  Custom Expiration Date (YYYY-MM-DD)", value: "custom" },
            { label: "  Back", value: "back" },
          ],
        });

        if (!expireChoice || expireChoice === "back") continue;

        let expiresAt: string | undefined;
        if (expireChoice === "7d") {
          expiresAt = getLocalDaysAheadString(7);
        } else if (expireChoice === "14d") {
          expiresAt = getLocalDaysAheadString(14);
        } else if (expireChoice === "30d") {
          expiresAt = getLocalDaysAheadString(30);
        } else if (expireChoice === "custom") {
          const defaultCustom = getLocalDaysAheadString(30);
          const customDate = await promptText({
            message: "Enter expiration date (YYYY-MM-DD):",
            defaultValue: defaultCustom,
          });
          if (customDate) expiresAt = customDate.trim();
        }

        schedConfig.expiresAt = expiresAt;

        const summaryDesc = formatScheduleSummary(schedConfig);
        const expDesc = expiresAt ? ` (expires: ${expiresAt})` : "";
        if (targetEngine === "launchd") {
          await LaunchdScheduler.install(schedConfig);
          Logger.success(`macOS LaunchAgent installed: ${summaryDesc}${expDesc}.`);
        } else {
          await CronScheduler.install(schedConfig);
          Logger.success(`Crontab job installed: ${summaryDesc}${expDesc}.`);
        }
        return;
      }
    }
  }

  private static async handleRepoSettings(ctx: MenuContext): Promise<void> {
    while (true) {
      console.log(`\n${ANSI.bold}${ANSI.yellow}=== Repository & Custom Prompts Settings ===${ANSI.reset}\n`);

      console.log(`  Current Config File: ${ANSI.cyan}${ctx.config.configPath}${ANSI.reset}`);
      console.log(`  Output Root Directory: ${ANSI.cyan}${ctx.config.outputRoot}${ANSI.reset}`);
      console.log(`  Report Expiration: ${ANSI.cyan}${ctx.config.retentionDays > 0 ? `${ctx.config.retentionDays} days` : "Disabled (keep forever)"}${ANSI.reset}`);
      console.log(`  Report Style: ${ANSI.cyan}${ctx.config.reportStyle || "default"}${ANSI.reset}`);
      console.log(`  Default AI Provider: ${ANSI.cyan}${ctx.config.defaultProvider}${ANSI.reset}\n`);

      const choices = [];
      if (ctx.isCurrentDirRepo && ctx.currentRepoPath) {
        choices.push({ label: " Add Current Directory to Monitored Repos", value: "add_cwd" });
      }
      choices.push(
        { label: ` Configure Report Retention Period (${ctx.config.retentionDays > 0 ? `${ctx.config.retentionDays}d` : "Disabled"})`, value: "edit_retention" },
        { label: " Prune / Clean Expired Reports Now", value: "clean_expired" },
        { label: `🧭 Switch Report Style Preset (${ctx.config.reportStyle || "default"})`, value: "switch_style" },
        { label: " Edit Default AI Prompt Template", value: "edit_prompt" },
        { label: " Switch Default AI Provider (Antigravity / Opencode / Gemini CLI)", value: "switch_provider" },
        { label: " Back", value: "back" },
      );

      const action = await promptSelect({
        message: "What would you like to configure?",
        choices,
      });

      if (!action || action === "back") return;

      if (action === "add_cwd" && ctx.currentRepoPath) {
        const exists = ctx.config.repos.some((r) => r.path === ctx.currentRepoPath);
        if (exists) {
          Logger.warn("Current repository is already in the configuration.");
        } else {
          const branches = await getGitBranches(ctx.currentRepoPath);
          const detectedName = await getRepoName(ctx.currentRepoPath);
          ctx.config.repos.push({
            path: ctx.currentRepoPath,
            repo_name: detectedName,
            branches: branches.length > 0 ? branches.slice(0, 2) : ["main"],
            custom_prompt: null,
            custom_prompt_file: null,
            diff_mode: true,
            max_diff_lines: 200,
          });
          await ConfigManager.save(ctx.config);
          Logger.success(`Added ${ctx.currentRepoPath} to monitored repositories.`);
        }
      } else if (action === "edit_retention") {
        const newDaysStr = await promptText({
          message: "Enter report retention period in days (0 = keep forever):",
          defaultValue: ctx.config.retentionDays.toString(),
        });
        if (newDaysStr !== null) {
          const parsedDays = parseInt(newDaysStr.trim(), 10);
          if (!isNaN(parsedDays) && parsedDays >= 0) {
            ctx.config.retentionDays = parsedDays;
            await ConfigManager.save(ctx.config);
            Logger.success(`Report retention period updated to ${parsedDays === 0 ? "forever (disabled)" : `${parsedDays} days`}.`);
          } else {
            Logger.warn("Invalid retention days value. Please provide a non-negative integer.");
          }
        }
      } else if (action === "clean_expired") {
        const deleted = await ReportStorage.cleanExpiredReports(ctx.config.outputRoot, ctx.config.retentionDays);
        if (deleted.length === 0) {
          Logger.info(`No expired reports found in ${ctx.config.outputRoot} (> ${ctx.config.retentionDays} days old).`);
        } else {
          Logger.success(`Cleaned up ${deleted.length} expired report(s).`);
        }
      } else if (action === "switch_style") {
        const newStyle = await promptSelect<string>({
          message: "Select report style preset:",
          choices: [
            { label: "🧭 System-Centric Architecture (Codebase maps, causal Problem->Change->Result, behavior tables)", value: "system-centric" },
            { label: "🏗️  Engineering Deep Dive (Default structure)", value: "default" },
            { label: "📝 Release Changelog (Features, fixes, breaking changes)", value: "changelog" },
            { label: "🛡️  Security & Risk Review (Sensitive logic, dependencies)", value: "security" },
            { label: " Back", value: "back" },
          ],
        });
        if (newStyle && newStyle !== "back") {
          ctx.config.reportStyle = newStyle;
          await ConfigManager.save(ctx.config);
          Logger.success(`Report style updated to "${newStyle}".`);
        }
      } else if (action === "edit_prompt") {
        const newPrompt = await promptText({
          message: "Enter new default prompt:",
          defaultValue: ctx.config.prompt,
        });
        if (newPrompt !== null) {
          ctx.config.prompt = newPrompt;
          await ConfigManager.save(ctx.config);
          Logger.success("Default prompt updated.");
        }
      } else if (action === "switch_provider") {
        const discovered = await HarnessDiscovery.discoverAll();
        const choices = HarnessDiscovery.buildMenuChoices(discovered, ctx.config.defaultProvider);
        choices.push({
          label: " Back",
          value: "back",
          hint: "",
          selected: false,
        });

        const newProvider = await promptSelect<string>({
          message: "Select default AI provider / agent harness:",
          choices,
        });
        if (newProvider && newProvider !== "back") {
          ctx.config.defaultProvider = newProvider;
          await ConfigManager.save(ctx.config);
          Logger.success(`Default AI provider set to "${newProvider}".`);
        }
      }

    }
  }

  private static async handleInstallSkill(): Promise<void> {
    console.log(`\n${ANSI.bold}${ANSI.yellow}=== Install Global AI Skill ===${ANSI.reset}\n`);
    const target = await promptSelect({
      message: "Where would you like to install the ingest AI skill?",
      choices: [
        { label: " Global Agent Directory (~/.gemini/config/skills/ingest/)", value: "global" },
        { label: " Local Workspace Directory (.agents/skills/ingest/)", value: "workspace" },
        { label: " Back", value: "back" },
      ],
    });

    if (!target || target === "back") return;

    if (target === "global") {
      const path = await SkillInstaller.installGlobal();
      console.log(`  ${ANSI.green}✔ Skill deployed at:${ANSI.reset} ${path}`);
    } else {
      const path = await SkillInstaller.installWorkspace();
      console.log(`  ${ANSI.green}✔ Skill deployed at:${ANSI.reset} ${path}`);
    }
  }

  private static async handleTestAI(ctx: MenuContext): Promise<void> {
    console.log(`\n${ANSI.bold}${ANSI.yellow}=== Test AI Provider Connection ===${ANSI.reset}\n`);
    const provider = AIFactory.getProvider(ctx.config);
    console.log(`  Testing provider: ${ANSI.cyan}${provider.name}${ANSI.reset}...`);

    const available = await provider.isAvailable();
    if (!available) {
      Logger.warn(`Provider "${provider.name}" CLI is not detected in PATH.`);
    } else {
      Logger.success(`Provider "${provider.name}" CLI is available and reachable.`);
    }
  }

  private static async handleLaunchWebUI(ctx: MenuContext): Promise<void> {
    console.log(`\n${ANSI.bold}${ANSI.brightCyan}=== Launch Ingest Web UI Dashboard ===${ANSI.reset}\n`);

    let activeRepo: string | null = null;
    if (ctx.isCurrentDirRepo && ctx.currentRepoPath) {
      activeRepo = await getRepoName(ctx.currentRepoPath);
    }

    const server = new IngestWebServer({
      port: 3456,
      outputRoot: ctx.config.outputRoot,
      activeRepo,
      openBrowser: true,
    });

    const info = await server.start();
    console.log(`  ${ANSI.green}✔ Ingest Web UI running at:${ANSI.reset} ${ANSI.bold}${ANSI.underline}${info.url}${ANSI.reset}`);
    console.log(`  ${ANSI.dim}📁 Shared report store:${ANSI.reset}    ${info.outputRoot}`);
    if (info.activeRepo) {
      console.log(`  ${ANSI.dim} Active repository:${ANSI.reset}      ${ANSI.cyan}${info.activeRepo}${ANSI.reset}`);
    }
    console.log(`\n  ${ANSI.dim}Browser window opened. Press <Enter> to return to main menu.${ANSI.reset}\n`);

    await promptText({ message: "Press <Enter> to stop web server and return to menu..." });
    await server.stop();
    console.log(`  ${ANSI.yellow}Web server stopped.${ANSI.reset}\n`);
  }
}
