import { resolve } from "node:path";
import { ANSI, drawBox } from "./ansi.js";
import { promptConfirm, promptSelect, promptText } from "./prompt.js";
import { showTerminalPager } from "./pager.js";
import { ConfigManager } from "../config/manager.js";
import type { AppConfig, RepoConfig } from "../config/types.js";
import { isGitRepo, getCurrentBranch, resolveRepoPath, getGitBranches } from "../git/runner.js";
import { fetchRepoCommits } from "../git/log.js";
import { fetchDiffStat } from "../git/diff.js";
import { AIFactory } from "../ai/factory.js";
import { resolveRepoPrompt } from "../ai/prompt.js";
import { formatReportMarkdown, generateEmptyReport } from "../report/generator.js";
import { ReportStorage } from "../report/storage.js";
import { renderMarkdownToAnsi, renderReportFileToAnsi } from "../report/viewer.js";
import { CronScheduler } from "../scheduler/cron.js";
import { LaunchdScheduler } from "../scheduler/launchd.js";
import { SkillInstaller } from "../skill/installer.js";
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
        console.log(`  ${ANSI.dim}📍 Current Directory is a Git Repo:${ANSI.reset} ${ANSI.cyan}${cwd}${ANSI.reset}\n`);
      }

      const choices = [
        {
          label: "📊 Generate Git Report (Daily / Custom Date)",
          value: "generate",
          hint: "Single repo or all configured repositories",
        },
        {
          label: "📖 View Historical Reports (Markdown Explorer)",
          value: "view",
          hint: "Browse past summaries in styled terminal pager",
        },
        {
          label: "⏰ Scheduler Automation Wizard (Launchd / Cron)",
          value: "schedule",
          hint: "Setup or manage automated report runs",
        },
        {
          label: "✏️  Repo Settings & Custom Prompts",
          value: "settings",
          hint: "Configure monitored repos and custom prompt templates",
        },
        {
          label: "🤖 Install Global AI Agent Skill",
          value: "skill",
          hint: "Deploy skill to ~/.gemini/config/skills/ingest/",
        },
        {
          label: "🩺 Test AI Provider Connection",
          value: "test-ai",
          hint: "Verify Antigravity (agy) / Opencode CLI integration",
        },
        {
          label: "🚪 Exit",
          value: "exit",
        },
      ];

      const action = await promptSelect({
        message: "Select an action:",
        choices,
      });

      if (action === "exit") {
        console.log(`\n${ANSI.gray}Goodbye! 👋${ANSI.reset}\n`);
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
        }
      } catch (err) {
        await Logger.error("Interactive action failed", err);
      }

      const continueLoop = await promptConfirm({
        message: "Return to main menu?",
        defaultYes: true,
      });
      if (!continueLoop) {
        console.log(`\n${ANSI.gray}Goodbye! 👋${ANSI.reset}\n`);
        break;
      }
    }
  }

  private static printBanner(): void {
    const bannerLines = [
      `${ANSI.bold}${ANSI.brightCyan}INGEST${ANSI.reset} ${ANSI.gray}- AI Daily Report Generator & Git Intelligence${ANSI.reset}`,
      `${ANSI.dim}Zero-Dependency TUI | Deep-Dive Diffs | Auto-Scheduler | Global AI Skill${ANSI.reset}`,
    ];
    console.log(drawBox("⚡ ingest", bannerLines, 74).join("\n"));
    console.log("");
  }

  private static async handleGenerateReport(ctx: MenuContext): Promise<void> {
    console.log(`\n${ANSI.bold}${ANSI.yellow}=== Generate Git Report ===${ANSI.reset}\n`);

    // Select repository
    const repoChoices: Array<{ label: string; value: string }> = [];
    if (ctx.isCurrentDirRepo && ctx.currentRepoPath) {
      repoChoices.push({
        label: `📍 Current Repository (${ctx.currentRepoPath})`,
        value: ctx.currentRepoPath,
      });
    }

    for (const repo of ctx.config.repos) {
      if (repo.path !== ctx.currentRepoPath) {
        repoChoices.push({
          label: `📁 ${repo.repo_name || repo.path}`,
          value: repo.path,
        });
      }
    }

    repoChoices.push({
      label: "✨ Enter another repository path...",
      value: "__custom__",
    });

    if (ctx.config.repos.length > 1) {
      repoChoices.push({
        label: "🌐 All Configured Repositories",
        value: "__all__",
      });
    }

    const selectedTarget = await promptSelect({
      message: "Which repository would you like to analyze?",
      choices: repoChoices,
    });

    let targetRepos: Array<RepoConfig> = [];

    if (selectedTarget === "__all__") {
      targetRepos = ctx.config.repos;
    } else if (selectedTarget === "__custom__") {
      const customPath = await promptText({ message: "Enter absolute or relative path to git repository:" });
      const resolved = await resolveRepoPath(customPath);
      const branches = await getGitBranches(resolved);
      targetRepos = [{ path: resolved, branches: branches.length > 0 ? branches.slice(0, 2) : ["main"] }];
    } else {
      const found = ctx.config.repos.find((r) => r.path === selectedTarget);
      if (found) {
        targetRepos = [found];
      } else {
        const branches = await getGitBranches(selectedTarget);
        targetRepos = [{ path: selectedTarget, branches: branches.length > 0 ? branches.slice(0, 2) : ["main"] }];
      }
    }

    // Select Date filter
    const dateChoice = await promptSelect({
      message: "Select reporting time window:",
      choices: [
        { label: "🕒 Last 24 Hours (Default)", value: "24h" },
        { label: "📅 Today (from 00:00 local time)", value: "today" },
        { label: "🗓️  Custom Specific Date (YYYY-MM-DD)", value: "custom_date" },
        { label: "⏳ Last 7 Days", value: "7d" },
      ],
    });

    let dateStr = new Date().toISOString().slice(0, 10);
    const dateFilter: { since?: string; until?: string; sinceHours?: number } = {};

    if (dateChoice === "24h") {
      dateFilter.sinceHours = 24;
    } else if (dateChoice === "today") {
      dateFilter.since = `${dateStr} 00:00:00`;
    } else if (dateChoice === "7d") {
      dateFilter.since = "7 days ago";
    } else if (dateChoice === "custom_date") {
      dateStr = await promptText({
        message: "Enter date (YYYY-MM-DD):",
        defaultValue: dateStr,
      });
      dateFilter.since = `${dateStr} 00:00:00`;
      dateFilter.until = `${dateStr} 23:59:59`;
    }

    const diffDeepDive = await promptConfirm({
      message: "Enable Git Diff Deep-Dive mode (inspect code diff stats & impacted files)?",
      defaultYes: true,
    });

    console.log(`\n${ANSI.cyan}Analyzing repositories...${ANSI.reset}`);

    for (const repo of targetRepos) {
      const repoPath = await resolveRepoPath(repo.path);
      const repoName = repo.repo_name || repoPath.split("/").pop() || "repository";
      const branches = repo.branches && repo.branches.length > 0 ? repo.branches : ["main"];

      console.log(`\n${ANSI.bold}Processing:${ANSI.reset} ${ANSI.cyan}${repoName}${ANSI.reset} (${repoPath})`);

      const commits = await fetchRepoCommits(repoPath, branches, dateFilter);
      console.log(`  Found ${ANSI.green}${commits.length}${ANSI.reset} commits across branches [${branches.join(", ")}].`);

      let diffStat;
      if (diffDeepDive && commits.length > 0) {
        diffStat = await fetchDiffStat(repoPath, branches, dateFilter);
        if (diffStat) {
          console.log(`  Diff Stat: ${diffStat.filesChangedCount} files changed (+${diffStat.insertions}, -${diffStat.deletions}).`);
        }
      }

      const activePrompt = await resolveRepoPrompt(ctx.config.prompt, repo.custom_prompt, null, repoPath);

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
        console.log(`  ${ANSI.magenta}🤖 Calling AI Provider (${ctx.config.defaultProvider})...${ANSI.reset}`);
        const provider = AIFactory.getProvider(ctx.config);
        const aiResult = await provider.analyze(analysisContext);
        const res = formatReportMarkdown(analysisContext, aiResult);
        reportMarkdown = res.markdown;
        reportMeta = res.meta;
      }

      const saved = await ReportStorage.saveReport(ctx.config.outputRoot, reportMeta, reportMarkdown);
      console.log(`  ${ANSI.green}✔ Report saved to:${ANSI.reset} ${saved.filePath}`);

      const shouldView = await promptConfirm({
        message: `View generated report for "${repoName}" now?`,
        defaultYes: true,
      });

      if (shouldView) {
        const ansiLines = renderMarkdownToAnsi(reportMarkdown);
        await showTerminalPager(ansiLines, `${repoName} - ${dateStr}`);
      }
    }
  }

  private static async handleViewReports(ctx: MenuContext): Promise<void> {
    console.log(`\n${ANSI.bold}${ANSI.yellow}=== Report Explorer & Viewer ===${ANSI.reset}\n`);

    const reports = await ReportStorage.listReports(ctx.config.outputRoot);
    if (reports.length === 0) {
      console.log(`  ${ANSI.yellow}No reports found in ${ctx.config.outputRoot}.${ANSI.reset}`);
      return;
    }

    const choices = reports.slice(0, 30).map((r) => ({
      label: `📄 ${r.repoName} [${r.dateStr}]`,
      value: r.filePath,
      hint: `${(r.sizeBytes / 1024).toFixed(1)} KB`,
    }));

    choices.push({
      label: "🔙 Back",
      value: "__back__",
      hint: "",
    });

    const chosenFile = await promptSelect({
      message: "Select a report to view in terminal pager:",
      choices,
    });

    if (chosenFile !== "__back__") {
      const renderedLines = await renderReportFileToAnsi(chosenFile);
      await showTerminalPager(renderedLines, chosenFile.split("/").pop() || "Report");
    }
  }

  private static async handleSchedulerWizard(ctx: MenuContext): Promise<void> {
    console.log(`\n${ANSI.bold}${ANSI.yellow}=== Scheduler Wizard ===${ANSI.reset}\n`);

    const isMac = LaunchdScheduler.isMacOS();
    const cronStatus = await CronScheduler.getStatus();
    const launchdStatus = isMac ? await LaunchdScheduler.getStatus() : null;

    console.log(`  ${ANSI.bold}System Scheduling Status:${ANSI.reset}`);
    if (isMac) {
      console.log(`  • macOS LaunchAgent: ${launchdStatus?.active ? ANSI.green + "ACTIVE" : ANSI.gray + "INACTIVE"}${ANSI.reset} (${launchdStatus?.details})`);
    }
    console.log(`  • Crontab: ${cronStatus.active ? ANSI.green + "ACTIVE" : ANSI.gray + "INACTIVE"}${ANSI.reset} (${cronStatus.details})\n`);

    const choices = [
      { label: "🚀 Install / Update Daily Report Schedule", value: "install" },
      { label: "🛑 Remove / Disable Automated Schedules", value: "uninstall" },
      { label: "🔙 Back to Main Menu", value: "back" },
    ];

    const action = await promptSelect({
      message: "Select schedule operation:",
      choices,
    });

    if (action === "back") return;

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
              { label: "🍏 macOS LaunchAgent (Recommended for Mac)", value: "launchd" },
              { label: "⚙️  Standard Crontab", value: "cron" },
            ],
          })
        : "cron";

      const timeInput = await promptText({
        message: "Enter run time in 24-hour format (HH:MM):",
        defaultValue: "00:00",
      });

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
    }
  }

  private static async handleRepoSettings(ctx: MenuContext): Promise<void> {
    console.log(`\n${ANSI.bold}${ANSI.yellow}=== Repository & Custom Prompts Settings ===${ANSI.reset}\n`);

    console.log(`  Current Config File: ${ANSI.cyan}${ctx.config.configPath}${ANSI.reset}`);
    console.log(`  Output Root Directory: ${ANSI.cyan}${ctx.config.outputRoot}${ANSI.reset}`);
    console.log(`  Default AI Provider: ${ANSI.cyan}${ctx.config.defaultProvider}${ANSI.reset}\n`);

    const action = await promptSelect({
      message: "What would you like to configure?",
      choices: [
        { label: "➕ Add Current Directory to Monitored Repos", value: "add_cwd" },
        { label: "📝 Edit Default AI Prompt Template", value: "edit_prompt" },
        { label: "🔄 Switch Default AI Provider (Opencode / Gemini CLI)", value: "switch_provider" },
        { label: "🔙 Back", value: "back" },
      ],
    });

    if (action === "add_cwd" && ctx.currentRepoPath) {
      const exists = ctx.config.repos.some((r) => r.path === ctx.currentRepoPath);
      if (exists) {
        Logger.warn("Current repository is already in the configuration.");
      } else {
        const branches = await getGitBranches(ctx.currentRepoPath);
        ctx.config.repos.push({
          path: ctx.currentRepoPath,
          repo_name: ctx.currentRepoPath.split("/").pop() || null,
          branches: branches.length > 0 ? branches.slice(0, 2) : ["main"],
          custom_prompt: null,
          custom_prompt_file: null,
          diff_mode: true,
          max_diff_lines: 200,
        });
        await ConfigManager.save(ctx.config);
        Logger.success(`Added ${ctx.currentRepoPath} to monitored repositories.`);
      }
    } else if (action === "edit_prompt") {
      const newPrompt = await promptText({
        message: "Enter new default prompt:",
        defaultValue: ctx.config.prompt,
      });
      ctx.config.prompt = newPrompt;
      await ConfigManager.save(ctx.config);
      Logger.success("Default prompt updated.");
    } else if (action === "switch_provider") {
      const newProvider = await promptSelect<"antigravity" | "opencode" | "gemini-cli">({
        message: "Select default AI provider:",
        choices: [
          { label: "Antigravity CLI (agy)", value: "antigravity" },
          { label: "Opencode CLI (Local/OpenAI)", value: "opencode" },
        ],
      });
      ctx.config.defaultProvider = newProvider;
      await ConfigManager.save(ctx.config);
      Logger.success(`Default AI provider set to "${newProvider}".`);
    }
  }

  private static async handleInstallSkill(): Promise<void> {
    console.log(`\n${ANSI.bold}${ANSI.yellow}=== Install Global AI Skill ===${ANSI.reset}\n`);
    const target = await promptSelect({
      message: "Where would you like to install the ingest AI skill?",
      choices: [
        { label: "🌐 Global Agent Directory (~/.gemini/config/skills/ingest/)", value: "global" },
        { label: "📁 Local Workspace Directory (.agents/skills/ingest/)", value: "workspace" },
      ],
    });

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
