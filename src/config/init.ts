import { access, mkdir, writeFile, readFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { ANSI, drawBox } from "../tui/ansi.js";
import { MultiSelectOption, promptConfirm, promptMultiSelect, promptSelect, promptText } from "../tui/prompt.js";
import { getAllGitBranches, getCurrentBranch, getGitBranches, getRepoName, isGitRepo, resolveRepoPath } from "../git/runner.js";
import { LaunchdScheduler } from "../scheduler/launchd.js";
import { CronScheduler } from "../scheduler/cron.js";
import { DEFAULT_CONFIG_PATH, DEFAULT_OUTPUT_ROOT, DEFAULT_PROMPT, resolveConfiguredPath } from "./manager.js";
import { SYSTEM_CENTRIC_PROMPT, CHANGELOG_PROMPT, SECURITY_PROMPT } from "../ai/prompt.js";
import { HarnessDiscovery } from "../ai/discovery.js";
import { Logger } from "../utils/logger.js";

export interface InitWizardOptions {
  quick?: boolean;
  local?: boolean;
  global?: boolean;
  targetPath?: string;
  cwd?: string;
}

export const PROMPT_PRESETS = [
  {
    label: "🏗️  Engineering Deep Dive (Default)",
    hint: "Architecture patterns, mechanics, code diff analysis, impact",
    prompt: DEFAULT_PROMPT,
    style: "default" as const,
  },
  {
    label: "🧭 System-Centric Architecture (New)",
    hint: "Codebase maps, causal Problem->Change->Result, behavior tables, flow diagrams",
    prompt: SYSTEM_CENTRIC_PROMPT,
    style: "system-centric" as const,
  },
  {
    label: "📝 Changelog & Release Notes",
    hint: "User-facing features, bug fixes, breaking changes",
    prompt: CHANGELOG_PROMPT,
    style: "changelog" as const,
  },
  {
    label: "🛡️  Security & Risk Review",
    hint: "Security posture, dependency changes, sensitive logic",
    prompt: SECURITY_PROMPT,
    style: "security" as const,
  },
  {
    label: "✏️  Custom Review Prompt",
    hint: "Write your own custom analysis prompt",
    prompt: "__custom__",
    style: "default" as const,
  },
];


export class ConfigInitWizard {
  public static async run(options: InitWizardOptions = {}): Promise<string | null> {
    const cwd = options.cwd || process.cwd();
    const isInsideGit = await isGitRepo(cwd);

    console.log(`\n${ANSI.bold}${ANSI.brightCyan}=== Ingest Configuration Setup Wizard ===${ANSI.reset}`);
    console.log(`  ${ANSI.dim}Configure repository analytics, AI providers, code diff depths, and daily automation.${ANSI.reset}\n`);

    // Determine quick vs guided mode
    let isQuick = options.quick ?? false;
    if (!isQuick && process.stdin.isTTY && !options.local && !options.global) {
      console.log(`  ${ANSI.bold}Configuration Components Overview:${ANSI.reset}`);
      console.log(`  ${ANSI.cyan}• AI Engine:${ANSI.reset}     Antigravity (agy), Opencode (OpenAI/Local LLMs), or Gemini CLI`);
      console.log(`  ${ANSI.cyan}• Git Tracking:${ANSI.reset}  Target branches, commit history, and diff deep-dive limits`);
      console.log(`  ${ANSI.cyan}• Review Focus:${ANSI.reset}  Engineering architecture, release notes, security, or custom`);
      console.log(`  ${ANSI.cyan}• Report Store:${ANSI.reset}  Hierarchical markdown storage & 30-day auto-retention policy`);
      console.log(`  ${ANSI.cyan}• Daily Sched:${ANSI.reset}   macOS LaunchAgent or Linux crontab background runner\n`);

      const modeChoice = await promptSelect({
        message: "Select initialization mode:",
        choices: [
          {
            label: "🚀 Quick Setup (Recommended defaults)",
            value: "quick",
            hint: "Instant setup with detected repo name, active branches, and Antigravity AI",
          },
          {
            label: "🛠️  Guided Step-by-Step Setup",
            value: "guided",
            hint: "Step-by-step walkthrough with full setting explanations and customization",
          },
        ],
      });

      if (!modeChoice) {
        console.log(`${ANSI.dim}Setup cancelled.${ANSI.reset}\n`);
        return null;
      }
      isQuick = modeChoice === "quick";
    }

    // Determine target scope (local vs global)
    let isLocal = options.local ?? false;
    if (!options.local && !options.global) {
      if (isInsideGit) {
        if (isQuick) {
          isLocal = true;
        } else {
          console.log(`\n${ANSI.bold}${ANSI.cyan}── Configuration Scope ──${ANSI.reset}`);
          console.log(`  ${ANSI.dim}Ingest supports local per-repo overrides or machine-wide global defaults:${ANSI.reset}\n`);
          console.log(`  ${ANSI.bold}Scope Comparison:${ANSI.reset}`);
          console.log(`  ${ANSI.green}• Local (.ingestrc):${ANSI.reset}     Saved in project root. Overrides branches, diff limits,`);
          console.log(`                             and custom review prompts specifically for this repository.`);
          console.log(`  ${ANSI.blue}• Global (config.jsonc):${ANSI.reset} Saved in ~/.config/ingest/. Defines multi-repo lists,`);
          console.log(`                             AI provider credentials, and fallback output folders.\n`);

          const scopeChoice = await promptSelect({
            message: "Where would you like to save this configuration?",
            choices: [
              {
                label: "📁 Local Repository (.ingestrc in project root)",
                value: "local",
                hint: "Recommended for project-specific rules, target branches, and custom prompts",
              },
              {
                label: "🌐 Global User Config (~/.config/ingest/config.jsonc)",
                value: "global",
                hint: "For machine-wide defaults, multi-repo tracking, and shared AI provider settings",
              },
            ],
          });
          if (!scopeChoice) return null;
          isLocal = scopeChoice === "local";
        }
      } else {
        isLocal = false;
      }
    }

    if (isQuick) {
      return this.runQuickInit(cwd, isLocal, isInsideGit);
    }

    return this.runGuidedInit(cwd, isLocal, isInsideGit);
  }

  private static async runQuickInit(cwd: string, isLocal: boolean, isInsideGit: boolean): Promise<string | null> {
    const defaultProvider = await HarnessDiscovery.getDetectedDefault();

    if (isLocal) {
      const repoPath = isInsideGit ? await resolveRepoPath(cwd) : cwd;
      const repoName = isInsideGit ? await getRepoName(repoPath) : basename(cwd);
      const branches = isInsideGit ? await getGitBranches(repoPath) : ["main"];
      const activeBranches = branches.length > 0 ? branches.slice(0, 2) : ["main"];
      const targetFilePath = join(cwd, ".ingestrc");

      if (existsSync(targetFilePath)) {
        console.log(`  ${ANSI.yellow}Existing file found at ${targetFilePath}${ANSI.reset}\n`);
        const overwrite = await promptConfirm({
          message: `.ingestrc already exists in ${cwd}. Overwrite?`,
          defaultYes: true,
        });
        if (!overwrite) {
          console.log(`  ${ANSI.yellow}Existing configuration preserved.${ANSI.reset}\n`);
          return targetFilePath;
        }
      }

      const content = `// Ingest Local Repository Configuration (.ingestrc)
// Documentation: https://github.com/tsuzuku/ingest
//
// SETTINGS REFERENCE:
// • repo_name: Custom repository display name (null = auto-detect)
// • branches: Target Git branches to analyze for commit activity
// • diff_mode: When true, extracts git diff stats & line changes (+/-)
// • max_diff_lines: Max patch lines per commit sent to AI context
// • retention_days: Report retention expiration in days (default: 30, 0 = keep forever)
// • default_provider: Auto-detected or configured AI backend
// • prompt: System prompt instructions guiding AI summary generation
{
  "repo_name": "${repoName}",
  "branches": ${JSON.stringify(activeBranches)},
  "diff_mode": true,
  "max_diff_lines": 200,
  "retention_days": 30,
  "default_provider": "${defaultProvider}",
  "prompt": "${DEFAULT_PROMPT}"
}
`;
      await writeFile(targetFilePath, content, "utf8");
      await this.handleGitignorePrompt(cwd, basename(targetFilePath), isInsideGit);
      this.printSuccessCard(targetFilePath, "Local repository configuration (.ingestrc) created with detected defaults.");
      return targetFilePath;
    }

    // Global quick init
    const globalPath = DEFAULT_CONFIG_PATH;
    const resolvedPath = resolveConfiguredPath(globalPath);

    if (existsSync(resolvedPath)) {
      console.log(`  ${ANSI.yellow}Existing global config found at ${resolvedPath}${ANSI.reset}\n`);
      const overwrite = await promptConfirm({
        message: `Global config already exists at ${resolvedPath}. Overwrite?`,
        defaultYes: false,
      });
      if (!overwrite) {
        console.log(`  ${ANSI.yellow}Existing configuration preserved.${ANSI.reset}\n`);
        return resolvedPath;
      }
    }

    let defaultRepos: Array<{ path: string; repo_name: string | null; branches: string[]; diff_mode: boolean }> = [];
    if (isInsideGit) {
      const repoPath = await resolveRepoPath(cwd);
      const repoName = await getRepoName(repoPath);
      const branches = await getGitBranches(repoPath);
      defaultRepos = [
        {
          path: repoPath,
          repo_name: repoName,
          branches: branches.length > 0 ? branches.slice(0, 2) : ["main"],
          diff_mode: true,
        },
      ];
    }

    await mkdir(dirname(resolvedPath), { recursive: true });
    const content = `// Ingest Global Configuration (~/.config/ingest/config.jsonc)
// Documentation: https://github.com/tsuzuku/ingest
//
// SETTINGS REFERENCE:
// • repos: List of repositories to analyze in headless multi-repo runs
// • output_root: Destination folder for markdown reports (<root>/<repo>/YYYY-MM-DD-summary.md)
// • retention_days: Automatic report retention period in days (default: 30, 0 = keep forever)
// • error_log: Path for recording non-fatal error traces (default: error.log)
// • default_provider: Default AI backend ("antigravity" | "claude" | "codex" | "pi" | "opencode" | etc.)
// • provider: Custom provider configs (endpoints, model overrides, tokens)
// • prompt: Default engineering analysis prompt template
{
  "repos": ${JSON.stringify(defaultRepos, null, 4)},
  "output_root": "~/reports",
  "retention_days": 30,
  "error_log": "error.log",
  "default_provider": "${defaultProvider}",
  "provider": {
    "antigravity": {
      "dangerously_skip_permissions": true
    },
    "opencode": {
      "model": "qwen-max",
      "endpoint": "http://localhost:1234/v1/chat/completions",
      "api_key_env": null
    }
  },
  "prompt": "${DEFAULT_PROMPT}"
}
`;
    await writeFile(resolvedPath, content, "utf8");
    this.printSuccessCard(resolvedPath, "Global configuration created at ~/.config/ingest/config.jsonc.");
    return resolvedPath;
  }

  private static async runGuidedInit(cwd: string, isLocal: boolean, isInsideGit: boolean): Promise<string | null> {
    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 1: AI Provider Selection (default_provider) ──${ANSI.reset}`);
    console.log(
      `  ${ANSI.dim}Ingest dynamically probes your environment for installed AI agent harnesses and CLI tools.${ANSI.reset}\n`,
    );

    const discovered = await HarnessDiscovery.discoverAll();
    const availableCount = discovered.filter((d) => d.available).length;
    if (availableCount > 0) {
      console.log(`  ${ANSI.bold}${ANSI.green}✔ Detected ${availableCount} available harness(es) in PATH:${ANSI.reset}`);
      for (const h of discovered.filter((d) => d.available)) {
        const verStr = h.version ? ` (${h.version})` : "";
        console.log(`    ${ANSI.green}• ${h.name}${verStr}:${ANSI.reset} ${ANSI.dim}${h.description}${ANSI.reset}`);
      }
      console.log("");
    } else {
      console.log(`  ${ANSI.bold}${ANSI.yellow}⚠ No supported CLI harnesses detected in PATH. Select an option to configure or install.${ANSI.reset}\n`);
    }

    const providerChoices = HarnessDiscovery.buildMenuChoices(discovered);
    const providerChoice = await promptSelect({
      message: "Choose your default AI provider / harness:",
      choices: providerChoices,
    });

    if (!providerChoice) return null;

    let opencodeModel = "qwen-max";
    let opencodeEndpoint = "http://localhost:1234/v1/chat/completions";
    let providerConfigObj: Record<string, unknown> = {};

    if (providerChoice === "opencode") {
      console.log(`  ${ANSI.dim}Model name for completions (e.g. qwen-max, gpt-4o, deepseek-chat, llama3.3).${ANSI.reset}`);
      const modelInput = await promptText({
        message: "Opencode model name:",
        defaultValue: "qwen-max",
      });
      if (modelInput === null) return null;
      opencodeModel = modelInput.trim() || "qwen-max";

      console.log(`  ${ANSI.dim}Endpoint URL (e.g. LM Studio: http://localhost:1234/v1/chat/completions, Ollama: http://localhost:11434/v1/chat/completions).${ANSI.reset}`);
      const endpointInput = await promptText({
        message: "API endpoint URL:",
        defaultValue: "http://localhost:1234/v1/chat/completions",
      });
      if (endpointInput === null) return null;
      opencodeEndpoint = endpointInput.trim() || "http://localhost:1234/v1/chat/completions";
      providerConfigObj = {
        opencode: {
          model: opencodeModel,
          endpoint: opencodeEndpoint,
          api_key_env: null,
        },
      };
    } else if (providerChoice === "ollama") {
      const modelInput = await promptText({
        message: "Ollama model name (e.g. llama3.2, qwen2.5-coder, mistral):",
        defaultValue: "llama3.2",
      });
      if (modelInput === null) return null;
      const model = modelInput.trim() || "llama3.2";
      providerConfigObj = {
        ollama: { model },
      };
    } else if (providerChoice === "claude") {
      const modelInput = await promptText({
        message: "Claude model override (leave empty for default Claude Code model):",
        defaultValue: "",
      });
      if (modelInput === null) return null;
      const model = modelInput.trim();
      if (model) {
        providerConfigObj = { claude: { model } };
      }
    } else if (providerChoice === "codex") {
      const modelInput = await promptText({
        message: "Codex model override (leave empty for default):",
        defaultValue: "",
      });
      if (modelInput === null) return null;
      const model = modelInput.trim();
      providerConfigObj = {
        codex: model ? { model, ephemeral: true } : { ephemeral: true },
      };
    } else if (providerChoice === "pi") {
      const modelInput = await promptText({
        message: "Pi model override (leave empty for default Pi model):",
        defaultValue: "",
      });
      if (modelInput === null) return null;
      const model = modelInput.trim();
      if (model) {
        providerConfigObj = { pi: { model } };
      }
    } else if (providerChoice === "aider") {
      const modelInput = await promptText({
        message: "Aider model override (leave empty for default Aider model):",
        defaultValue: "",
      });
      if (modelInput === null) return null;
      const model = modelInput.trim();
      if (model) {
        providerConfigObj = { aider: { model } };
      }
    } else if (providerChoice === "custom") {
      const commandInput = await promptText({
        message: "Custom CLI command or binary name:",
        defaultValue: "my-agent",
      });
      if (!commandInput) return null;
      const argsInput = await promptText({
        message: "Command arguments before prompt (space-separated, optional):",
        defaultValue: "",
      });
      const args = argsInput ? argsInput.trim().split(" ").filter(Boolean) : [];
      providerConfigObj = {
        custom: {
          command: commandInput.trim(),
          args,
        },
      };
    } else if (providerChoice === "antigravity" || providerChoice === "agy" || providerChoice === "gemini-cli") {
      providerConfigObj = {
        antigravity: {
          dangerously_skip_permissions: true,
        },
      };
    }


    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 2: Git Branches & Diff Analytics (branches, diff_mode, max_diff_lines) ──${ANSI.reset}`);
    console.log(
      `  ${ANSI.dim}Configure how Git commit activity and code changes are extracted for analysis.${ANSI.reset}\n`,
    );
    console.log(`  ${ANSI.bold}Settings Explanation:${ANSI.reset}`);
    console.log(`  ${ANSI.yellow}• Target Branches (branches):${ANSI.reset}     Commits across selected branches will be aggregated & analyzed.`);
    console.log(`  ${ANSI.green}• Diff Deep-Dive (diff_mode):${ANSI.reset}      When true, inspects file stats (+/- lines) and patch excerpts`);
    console.log(`                                    instead of commit messages alone.`);
    console.log(`  ${ANSI.blue}• Max Diff Lines (max_diff_lines):${ANSI.reset} Caps patch line count per commit to prevent LLM context overflow.\n`);
    console.log(
      `  ${ANSI.dim}Select branches: <space> to toggle, type to filter/search, and <enter> to confirm.${ANSI.reset}\n`,
    );

    let branches: string[] = ["main"];
    if (isInsideGit) {
      const allBranches = await getAllGitBranches(cwd);
      const currentBranch = await getCurrentBranch(cwd);
      const candidateBranches = allBranches.length > 0 ? allBranches : ["main", "master", "dev"];

      const multiChoices: MultiSelectOption<string>[] = candidateBranches.map((b) => {
        const isCurrent = b === currentBranch;
        const isDefault = b === "main" || b === "master" || isCurrent;
        return {
          label: b,
          value: b,
          hint: isCurrent ? "active branch" : undefined,
          selected: isDefault,
        };
      });

      const selectedBranches = await promptMultiSelect({
        message: "Select target branches to analyze:",
        choices: multiChoices,
        allowCustomInput: true,
      });

      if (selectedBranches === null) return null;
      branches = selectedBranches.length > 0 ? selectedBranches : [currentBranch || "main"];
    } else {
      const branchesInput = await promptText({
        message: "Target branches to analyze (comma-separated):",
        defaultValue: "main",
      });
      if (branchesInput === null) return null;
      branches = branchesInput
        .split(",")
        .map((b) => b.trim())
        .filter((b) => b.length > 0);
    }

    const diffMode = await promptConfirm({
      message: "Enable deep-dive code diff extraction (git log -p / diff stat)?",
      defaultYes: true,
    });

    let maxDiffLines = 200;
    if (diffMode) {
      console.log(`  ${ANSI.dim}Recommended: 100-500 lines per commit. Caps patch excerpts to fit AI context safely.${ANSI.reset}`);
      const diffLinesInput = await promptText({
        message: "Maximum diff lines per commit context (max_diff_lines):",
        defaultValue: "200",
      });
      if (diffLinesInput === null) return null;
      maxDiffLines = parseInt(diffLinesInput, 10) || 200;
    }

    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 3: Analysis Perspective & Prompt Template (prompt) ──${ANSI.reset}`);
    console.log(
      `  ${ANSI.dim}The prompt instructs the AI model on which technical angles and details to highlight.${ANSI.reset}\n`,
    );
    console.log(`  ${ANSI.bold}Available Perspectives:${ANSI.reset}`);
    console.log(`  ${ANSI.yellow}• Engineering Deep Dive:${ANSI.reset} Architecture patterns, implementation mechanics, and diff impact.`);
    console.log(`  ${ANSI.green}• Release Changelog:${ANSI.reset}     User-facing features, critical fixes, breaking changes, migration.`);
    console.log(`  ${ANSI.red}• Security & Risk:${ANSI.reset}       Sensitive logic, permission checks, dependency changes, regressions.`);
    console.log(`  ${ANSI.magenta}• Custom Prompt:${ANSI.reset}         Write your own specific domain rules and instructions.\n`);

    const promptChoice = await promptSelect({
      message: "Select AI report perspective:",
      choices: PROMPT_PRESETS.map((p) => ({
        label: p.label,
        value: p.prompt,
        hint: p.hint,
      })),
    });

    if (!promptChoice) return null;

    let finalPrompt = promptChoice;
    let selectedStyle: string = "default";
    const foundPreset = PROMPT_PRESETS.find((p) => p.prompt === promptChoice);
    if (foundPreset) {
      selectedStyle = foundPreset.style;
    }

    if (promptChoice === "__custom__") {
      const customInput = await promptText({
        message: "Enter your custom AI prompt instructions:",
        defaultValue: DEFAULT_PROMPT,
      });
      if (customInput === null) return null;
      finalPrompt = customInput.trim() || DEFAULT_PROMPT;
      selectedStyle = "default";
    }

    let outputRoot = "~/reports";
    if (!isLocal) {
      console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 4: Report Storage & Expiration (output_root, retention_days, error_log) ──${ANSI.reset}`);
      console.log(
        `  ${ANSI.dim}Specify where generated Markdown summaries are stored and how long they are retained.${ANSI.reset}\n`,
      );
      console.log(`  ${ANSI.bold}Storage & Retention Settings:${ANSI.reset}`);
      console.log(`  ${ANSI.yellow}• Daily Reports:${ANSI.reset}   ${ANSI.cyan}<output_root>/<repo_name>/YYYY-MM-DD-summary.md${ANSI.reset}`);
      console.log(`  ${ANSI.green}• Date Ranges:${ANSI.reset}     ${ANSI.cyan}<output_root>/<repo_name>/YYYY-MM-DD-to-YYYY-MM-DD-summary.md${ANSI.reset}`);
      console.log(`  ${ANSI.blue}• Expiration:${ANSI.reset}      Automatically prune reports older than N days (default: 30, 0 = keep forever).\n`);

      const outputInput = await promptText({
        message: "Report output directory (output_root):",
        defaultValue: "~/reports",
        completer: "dir",
      });
      if (outputInput === null) return null;
      outputRoot = outputInput.trim() || "~/reports";
    } else {
      console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 4: Report Retention & Expiration (retention_days) ──${ANSI.reset}`);
      console.log(
        `  ${ANSI.dim}Specify how long generated Markdown summaries are retained before automatic cleanup.${ANSI.reset}\n`,
      );
      console.log(`  ${ANSI.bold}Storage Location:${ANSI.reset} Reports are centrally stored in your global output directory (default: ~/reports/<repo_name>/).`);
      console.log(`  ${ANSI.blue}• Expiration:${ANSI.reset}     Automatically prune reports older than N days (default: 30, 0 = keep forever).\n`);
    }

    const retentionInput = await promptText({
      message: "Report retention period in days (retention_days, 0 = keep forever):",
      defaultValue: "30",
    });
    if (retentionInput === null) return null;
    const retentionDays = parseInt(retentionInput.trim(), 10);
    const validRetentionDays = !isNaN(retentionDays) && retentionDays >= 0 ? retentionDays : 30;

    // Optional Step 5: Scheduler setup
    let scheduleInstalled = false;
    if (process.stdin.isTTY) {
      console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 5: Automated Daily Schedule (launchd / cron) ──${ANSI.reset}`);
      console.log(
        `  ${ANSI.dim}Ingest can run in the background every day to generate fresh reports automatically.${ANSI.reset}\n`,
      );
      console.log(`  ${ANSI.bold}Automation Engine Support:${ANSI.reset}`);
      console.log(`  ${ANSI.yellow}• macOS (launchd):${ANSI.reset}   Installs a user LaunchAgent plist that triggers daily in user space`);
      console.log(`                         even if your terminal window is closed.`);
      console.log(`  ${ANSI.green}• Linux/Unix (cron):${ANSI.reset} Configures standard user crontab entry for automated execution.\n`);

      const wantSchedule = await promptConfirm({
        message: "Would you like to install an automated daily report schedule now?",
        defaultYes: false,
      });

      if (wantSchedule) {
        const timeInput = await promptText({
          message: "Run schedule daily at time (HH:MM 24-hour format):",
          defaultValue: "18:00",
        });
        const scheduleTime = timeInput?.trim() || "18:00";
        try {
          if (LaunchdScheduler.isMacOS()) {
            await LaunchdScheduler.install({ frequency: "daily", time: scheduleTime });
            console.log(`  ${ANSI.green}✔ Installed macOS LaunchAgent for daily run at ${scheduleTime}.${ANSI.reset}\n`);
          } else {
            await CronScheduler.install({ frequency: "daily", time: scheduleTime });
            console.log(`  ${ANSI.green}✔ Installed crontab job for daily run at ${scheduleTime}.${ANSI.reset}\n`);
          }
          scheduleInstalled = true;
        } catch (err) {
          Logger.warn(`Could not install schedule: ${String(err)}`);
        }
      }
    }

    // Step 6: Write configuration
    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 6: Save Configuration ──${ANSI.reset}\n`);

    if (isLocal) {
      const targetFilePath = join(cwd, ".ingestrc");
      if (existsSync(targetFilePath)) {
        console.log(`  ${ANSI.yellow}Note: .ingestrc already exists in ${cwd}.${ANSI.reset}\n`);
        const overwrite = await promptConfirm({
          message: "Overwrite existing .ingestrc file?",
          defaultYes: true,
        });
        if (!overwrite) {
          console.log(`  ${ANSI.yellow}Existing configuration preserved.${ANSI.reset}\n`);
          return targetFilePath;
        }
      }

      const repoName = isInsideGit ? await getRepoName(cwd) : "project";
      const configObj: Record<string, unknown> = {
        repo_name: repoName,
        branches: branches.length > 0 ? branches : ["main"],
        diff_mode: diffMode,
        max_diff_lines: maxDiffLines,
        retention_days: validRetentionDays,
        default_provider: providerChoice,
        prompt: finalPrompt,
        report_style: selectedStyle,
      };

      if (Object.keys(providerConfigObj).length > 0) {
        configObj.provider = providerConfigObj;
      }

      const content = `// Ingest Local Repository Configuration (.ingestrc)
// Documentation & guide: https://github.com/tsuzuku/ingest
//
// SETTINGS REFERENCE:
// • repo_name: Custom name in report headers (null = auto-detect)
// • branches: Target Git branches to analyze for commit activity
// • diff_mode: When true, extracts git diff stats & line changes (+/-)
// • max_diff_lines: Max patch lines per commit sent to AI context
// • retention_days: Report retention expiration in days (default: 30, 0 = keep forever)
// • default_provider: Default AI provider / agent harness
// • prompt: System prompt instructions guiding AI summary generation
// • report_style: "default" | "system-centric" | "changelog" | "security"
${JSON.stringify(configObj, null, 2)}
`;
      await writeFile(targetFilePath, content, "utf8");
      await this.handleGitignorePrompt(cwd, basename(targetFilePath), isInsideGit);
      this.printSuccessCard(targetFilePath, "Local repository configuration (.ingestrc) saved successfully.");
      return targetFilePath;
    }

    // Global config
    const targetFilePath = resolveConfiguredPath(DEFAULT_CONFIG_PATH);
    await mkdir(dirname(targetFilePath), { recursive: true });

    if (existsSync(targetFilePath)) {
      console.log(`  ${ANSI.yellow}Note: Global config already exists at ${targetFilePath}.${ANSI.reset}\n`);
      const overwrite = await promptConfirm({
        message: "Overwrite existing global configuration?",
        defaultYes: false,
      });
      if (!overwrite) {
        console.log(`  ${ANSI.yellow}Existing configuration preserved.${ANSI.reset}\n`);
        return targetFilePath;
      }
    }

    const repos = isInsideGit
      ? [
          {
            path: await resolveRepoPath(cwd),
            repo_name: await getRepoName(cwd),
            branches: branches.length > 0 ? branches : ["main"],
            diff_mode: diffMode,
            max_diff_lines: maxDiffLines,
            report_style: selectedStyle,
          },
        ]
      : [];

    const globalObj: Record<string, unknown> = {
      repos,
      output_root: outputRoot,
      retention_days: validRetentionDays,
      error_log: "error.log",
      default_provider: providerChoice,
      provider: {
        antigravity: {
          dangerously_skip_permissions: true,
        },
        opencode: {
          model: opencodeModel,
          endpoint: opencodeEndpoint,
          api_key_env: null,
        },
        ...providerConfigObj,
      },
      prompt: finalPrompt,
      report_style: selectedStyle,
    };

    const content = `// Ingest Global Configuration (~/.config/ingest/config.jsonc)
// Documentation: https://github.com/tsuzuku/ingest
//
// SETTINGS REFERENCE:
// • repos: List of repositories to analyze in headless multi-repo runs
// • output_root: Destination folder for markdown reports (<root>/<repo>/YYYY-MM-DD-summary.md)
// • retention_days: Automatic report retention period in days (default: 30, 0 = keep forever)
// • error_log: Path for recording non-fatal error traces (default: error.log)
// • default_provider: Default AI backend ("antigravity" | "opencode" | "gemini-cli")
// • provider: Custom provider configs (endpoints, model overrides, tokens)
// • prompt: Default engineering analysis prompt template
// • report_style: "default" | "system-centric" | "changelog" | "security"
${JSON.stringify(globalObj, null, 2)}
`;
    await writeFile(targetFilePath, content, "utf8");
    this.printSuccessCard(targetFilePath, "Global configuration saved successfully to ~/.config/ingest/config.jsonc.");
    return targetFilePath;
  }

  /**
   * Checks if .gitignore exists or is in a git repo, prompts to add the config filename if not already ignored.
   */
  public static async handleGitignorePrompt(
    cwd: string,
    configFileName: string = ".ingestrc",
    isInsideGit?: boolean,
  ): Promise<boolean> {
    const gitignorePath = join(cwd, ".gitignore");
    const gitignoreExists = existsSync(gitignorePath);
    const insideGit = isInsideGit ?? (await isGitRepo(cwd));

    if (!insideGit && !gitignoreExists) {
      return false;
    }

    let existingContent = "";
    if (gitignoreExists) {
      try {
        existingContent = await readFile(gitignorePath, "utf8");
        const lines = existingContent.split(/\r?\n/).map((l) => l.trim());
        if (
          lines.includes(configFileName) ||
          lines.includes(`/${configFileName}`) ||
          lines.includes(`./${configFileName}`)
        ) {
          return true; // Already listed
        }
      } catch {
        // Fall through
      }
    }

    const shouldAdd = await promptConfirm({
      message: `Add ${configFileName} to .gitignore?`,
      defaultYes: true,
    });

    if (!shouldAdd) {
      return false;
    }

    try {
      const needsLeadingNewline = existingContent.length > 0 && !existingContent.endsWith("\n");
      const addition = `${needsLeadingNewline ? "\n" : ""}${configFileName}\n`;
      if (gitignoreExists) {
        await appendFile(gitignorePath, addition, "utf8");
      } else {
        await writeFile(gitignorePath, addition, "utf8");
      }
      console.log(`  ${ANSI.green}✔ Added ${configFileName} to .gitignore${ANSI.reset}\n`);
      return true;
    } catch (err) {
      Logger.warn(`Could not update .gitignore: ${String(err)}`);
      return false;
    }
  }

  private static printSuccessCard(filePath: string, message: string): void {
    const cardLines = [
      `${ANSI.bold}${ANSI.green}✔ ${message}${ANSI.reset}`,
      `${ANSI.dim}Config path: ${filePath}${ANSI.reset}`,
      "",
      `${ANSI.bold}Next Steps:${ANSI.reset}`,
      `  • ${ANSI.cyan}ingest${ANSI.reset}               Launch the interactive terminal UI menu`,
      `  • ${ANSI.cyan}ingest --diff${ANSI.reset}        Generate a report with deep-dive code diff analysis`,
      `  • ${ANSI.cyan}ingest --today${ANSI.reset}       Generate summary of today's git activity`,
      `  • ${ANSI.cyan}ingest --help${ANSI.reset}        View all available flags and options`,
    ];

    const box = drawBox("⚙️ Setup Complete", cardLines, Math.min(80, (process.stdout.columns || 80) - 2));
    console.log(`\n${box.join("\n")}\n`);
  }
}
