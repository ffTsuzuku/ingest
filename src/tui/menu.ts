import { resolve } from "node:path";
import { ANSI, drawBox } from "./ansi.js";
import { promptSelect, promptText } from "./prompt.js";
import { showTerminalPager } from "./pager.js";
import { ConfigManager } from "../config/manager.js";
import type { AppConfig, RepoConfig } from "../config/types.js";
import { isGitRepo, getCurrentBranch, resolveRepoPath, getGitBranches, getRepoName } from "../git/runner.js";
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
import { SkillInstaller } from "../skill/installer.js";
import { ConfigInitWizard } from "../config/init.js";
import { Logger } from "../utils/logger.js";

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

    const todayStr = new Date().toISOString().slice(0, 10);
    let dateStr = todayStr;
    const dateFilter: { since?: string; until?: string; sinceHours?: number } = {};

    if (dateChoice === "24h") {
      dateFilter.sinceHours = 24;
      dateStr = todayStr;
    } else if (dateChoice === "today") {
      dateFilter.since = `${todayStr} 00:00:00`;
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
      const defaultStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
      const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      dateFilter.since = `${start} 00:00:00`;
      dateFilter.until = `${todayStr} 23:59:59`;
      dateStr = `${start}-to-${todayStr}`;
    } else if (dateChoice === "30d") {
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
      const effectiveRepo = await ConfigManager.mergeRepoWithLocalConfig(repo, repoPath);
      const repoName = await getRepoName(repoPath, effectiveRepo.repo_name);
      const branches = effectiveRepo.branches && effectiveRepo.branches.length > 0 ? effectiveRepo.branches : ["main"];

      console.log(`\n${ANSI.bold}Processing:${ANSI.reset} ${ANSI.cyan}${repoName}${ANSI.reset} (${repoPath})`);

      const commits = await fetchRepoCommits(repoPath, branches, dateFilter);
      console.log(`  Found ${ANSI.green}${commits.length}${ANSI.reset} commits across branches [${branches.join(", ")}].`);

      let diffStat;
      if (diffDeepDive && commits.length > 0) {
        diffStat = await fetchDiffStat(repoPath, branches, dateFilter, effectiveRepo.max_diff_lines);
        if (diffStat) {
          console.log(`  Diff Stat: ${diffStat.filesChangedCount} files changed (+${diffStat.insertions}, -${diffStat.deletions}).`);
        }
      }

      const activePrompt = await resolveRepoPrompt(
        ctx.config.prompt,
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
        basePrompt: ctx.config.prompt,
      };

      let reportMarkdown = "";
      let reportMeta;

      if (commits.length === 0) {
        console.log(`  ${ANSI.yellow}No commits found. Generating empty report.${ANSI.reset}`);
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
      console.log(`  ${ANSI.green}✔ Report saved to:${ANSI.reset} ${saved.filePath}`);

      if (ctx.config.retentionDays > 0) {
        const deleted = await ReportStorage.cleanExpiredReports(ctx.config.outputRoot, ctx.config.retentionDays);
        if (deleted.length > 0) {
          console.log(`  ${ANSI.dim}Auto-cleaned ${deleted.length} expired report(s) (> ${ctx.config.retentionDays} days old).${ANSI.reset}`);
        }
      }

      const ansiLines = renderMarkdownToAnsi(reportMarkdown);
      await showTerminalPager(ansiLines, `${repoName} - ${dateStr}`);
    }
  }

  private static async handleViewReports(ctx: MenuContext): Promise<void> {
    while (true) {
      console.log(`\n${ANSI.bold}${ANSI.yellow}=== Report Explorer & Viewer ===${ANSI.reset}\n`);

      const reports = await ReportStorage.listReports(ctx.config.outputRoot);
      if (reports.length === 0) {
        console.log(`  ${ANSI.yellow}No reports found in ${ctx.config.outputRoot}.${ANSI.reset}`);
        return;
      }

      const choices = reports.slice(0, 30).map((r) => ({
        label: ` ${r.repoName} [${r.dateStr}]`,
        value: r.filePath,
        hint: `${(r.sizeBytes / 1024).toFixed(1)} KB`,
      }));

      choices.push({
        label: " Back",
        value: "__back__",
        hint: "",
      });

      const chosenFile = await promptSelect({
        message: "Select a report to view in terminal pager:",
        choices,
      });

      if (!chosenFile || chosenFile === "__back__") {
        return;
      }

      const renderedLines = await renderReportFileToAnsi(chosenFile);
      await showTerminalPager(renderedLines, chosenFile.split("/").pop() || "Report");
    }
  }

  private static async handleSchedulerWizard(ctx: MenuContext): Promise<void> {
    while (true) {
      console.log(`\n${ANSI.bold}${ANSI.yellow}=== Scheduler Wizard ===${ANSI.reset}\n`);

      const isMac = LaunchdScheduler.isMacOS();
      const statusBox = await renderScheduleStatusBox();
      console.log(statusBox + "\n");

      const choices = [
        { label: " Install / Update Daily Report Schedule", value: "install" },
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

        const timeInput = await promptText({
          message: "Enter run time in 24-hour format (HH:MM):",
          defaultValue: "00:00",
        });

        if (!timeInput) continue;

        const schedConfig = {
          frequency: "daily" as const,
          time: timeInput,
          configPath: ctx.config.configPath,
        };

        if (targetEngine === "launchd") {
          await LaunchdScheduler.install(schedConfig);
          Logger.success(`macOS LaunchAgent installed to run daily at ${timeInput}.`);
        } else {
          await CronScheduler.install(schedConfig);
          Logger.success(`Crontab job installed to run daily at ${timeInput}.`);
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
      console.log(`  Default AI Provider: ${ANSI.cyan}${ctx.config.defaultProvider}${ANSI.reset}\n`);

      const choices = [];
      if (ctx.isCurrentDirRepo && ctx.currentRepoPath) {
        choices.push({ label: " Add Current Directory to Monitored Repos", value: "add_cwd" });
      }
      choices.push(
        { label: ` Configure Report Retention Period (${ctx.config.retentionDays > 0 ? `${ctx.config.retentionDays}d` : "Disabled"})`, value: "edit_retention" },
        { label: " Prune / Clean Expired Reports Now", value: "clean_expired" },
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
        const newProvider = await promptSelect<"antigravity" | "opencode" | "gemini-cli">({
          message: "Select default AI provider:",
          choices: [
            { label: " Antigravity CLI (agy)", value: "antigravity" },
            { label: " Opencode CLI (Local/OpenAI)", value: "opencode" },
            { label: " Gemini CLI", value: "gemini-cli" },
            { label: " Back", value: "back" as any },
          ],
        });
        if (newProvider && (newProvider as string) !== "back") {
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
}
