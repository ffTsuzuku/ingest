import { access, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { ANSI, drawBox } from "../tui/ansi.js";
import { MultiSelectOption, promptConfirm, promptMultiSelect, promptSelect, promptText } from "../tui/prompt.js";
import { getAllGitBranches, getCurrentBranch, getGitBranches, getRepoName, isGitRepo, resolveRepoPath } from "../git/runner.js";
import { LaunchdScheduler } from "../scheduler/launchd.js";
import { CronScheduler } from "../scheduler/cron.js";
import { DEFAULT_CONFIG_PATH, DEFAULT_OUTPUT_ROOT, DEFAULT_PROMPT, resolveConfiguredPath } from "./manager.js";
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
    prompt:
      "Perform an engineering deep dive into repo activity over the last 24h: architectural patterns, key implementation mechanics, code diff analysis, and technical impact.",
  },
  {
    label: "📝 Changelog & Release Notes",
    hint: "User-facing features, bug fixes, breaking changes",
    prompt:
      "Generate structured release changelog notes from repo commits: highlight user-facing features, critical bug fixes, breaking changes, and migration instructions.",
  },
  {
    label: "🛡️  Security & Risk Review",
    hint: "Security posture, dependency changes, sensitive logic",
    prompt:
      "Review git commits from a software security and risk perspective: audit sensitive logic changes, permission checks, dependency updates, and regression hazards.",
  },
  {
    label: "✏️  Custom Review Prompt",
    hint: "Write your own custom analysis prompt",
    prompt: "__custom__",
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
      console.log(`  ${ANSI.cyan}• Report Store:${ANSI.reset}  Hierarchical markdown storage (<output_root>/<repo>/<date>.md)`);
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
        console.log(`\n${ANSI.dim}Setup cancelled.${ANSI.reset}\n`);
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
    if (isLocal) {
      const repoPath = isInsideGit ? await resolveRepoPath(cwd) : cwd;
      const repoName = isInsideGit ? await getRepoName(repoPath) : basename(cwd);
      const branches = isInsideGit ? await getGitBranches(repoPath) : ["main"];
      const activeBranches = branches.length > 0 ? branches.slice(0, 2) : ["main"];
      const targetFilePath = join(cwd, ".ingestrc");

      if (existsSync(targetFilePath)) {
        const overwrite = await promptConfirm({
          message: `.ingestrc already exists in ${cwd}. Overwrite?`,
          defaultYes: true,
        });
        if (!overwrite) {
          console.log(`\n${ANSI.yellow}Existing configuration preserved.${ANSI.reset}\n`);
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
// • default_provider: "antigravity" | "opencode" | "gemini-cli"
// • prompt: System prompt instructions guiding AI summary generation
{
  "repo_name": "${repoName}",
  "branches": ${JSON.stringify(activeBranches)},
  "diff_mode": true,
  "max_diff_lines": 200,
  "default_provider": "antigravity",
  "prompt": "${DEFAULT_PROMPT}"
}
`;
      await writeFile(targetFilePath, content, "utf8");
      this.printSuccessCard(targetFilePath, "Local repository configuration (.ingestrc) created with detected defaults.");
      return targetFilePath;
    }

    // Global quick init
    const globalPath = DEFAULT_CONFIG_PATH;
    const resolvedPath = resolveConfiguredPath(globalPath);

    if (existsSync(resolvedPath)) {
      const overwrite = await promptConfirm({
        message: `Global config already exists at ${resolvedPath}. Overwrite?`,
        defaultYes: false,
      });
      if (!overwrite) {
        console.log(`\n${ANSI.yellow}Existing configuration preserved.${ANSI.reset}\n`);
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
// • error_log: Path for recording non-fatal error traces (default: error.log)
// • default_provider: Default AI backend ("antigravity" | "opencode" | "gemini-cli")
// • provider: Custom provider configs (endpoints, model overrides, tokens)
// • prompt: Default engineering analysis prompt template
{
  "repos": ${JSON.stringify(defaultRepos, null, 4)},
  "output_root": "~/reports",
  "error_log": "error.log",
  "default_provider": "antigravity",
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
      `  ${ANSI.dim}Ingest uses an AI backend to synthesize git commit histories, diff stats, and patch logs.${ANSI.reset}\n`,
    );
    console.log(`  ${ANSI.bold}AI Provider Options & Behavior:${ANSI.reset}`);
    console.log(`  ${ANSI.yellow}• Antigravity / AGY CLI:${ANSI.reset}     Zero setup! Connects directly to active Google Antigravity session.`);
    console.log(`                                 Headless-ready (auto-approves read permissions).`);
    console.log(`  ${ANSI.green}• Opencode / Custom API:${ANSI.reset}     Connects to any OpenAI-compatible HTTP completions endpoint`);
    console.log(`                                 (Ollama, LM Studio, vLLM, DeepSeek, OpenAI, etc.).`);
    console.log(`  ${ANSI.blue}• Gemini CLI:${ANSI.reset}                Invokes standard 'gemini' command line tool adapter.\n`);

    const providerChoice = await promptSelect({
      message: "Choose your default AI provider:",
      choices: [
        {
          label: "✨ Antigravity / AGY CLI (Recommended)",
          value: "antigravity",
          hint: "Zero API token setup required. Uses active Google Antigravity session.",
        },
        {
          label: "🤖 Opencode / OpenAI-compatible endpoint",
          value: "opencode",
          hint: "Custom endpoint (e.g. Ollama, LM Studio, vLLM, OpenAI, DeepSeek)",
        },
        {
          label: "♊ Gemini CLI",
          value: "gemini-cli",
          hint: "Standard Gemini CLI tool adapter",
        },
      ],
    });

    if (!providerChoice) return null;

    let opencodeModel = "qwen-max";
    let opencodeEndpoint = "http://localhost:1234/v1/chat/completions";

    if (providerChoice === "opencode") {
      console.log(`\n  ${ANSI.dim}Model name for completions (e.g. qwen-max, gpt-4o, deepseek-chat, llama3.3).${ANSI.reset}`);
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
    }

    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 2: Git Branches & Diff Analytics (branches, diff_mode, max_diff_lines) ──${ANSI.reset}`);
    console.log(
      `  ${ANSI.dim}Configure how Git commit activity and code changes are extracted for analysis.${ANSI.reset}\n`,
    );
    console.log(`  ${ANSI.bold}Settings Explanation:${ANSI.reset}`);
    console.log(`  ${ANSI.yellow}• Target Branches (branches):${ANSI.reset}   Commits across selected branches will be aggregated & analyzed.`);
    console.log(`  ${ANSI.green}• Diff Deep-Dive (diff_mode):${ANSI.reset}    When true, inspects file stats (+/- lines) and patch excerpts`);
    console.log(`                                  instead of commit messages alone.`);
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
    if (promptChoice === "__custom__") {
      const customInput = await promptText({
        message: "Enter your custom AI prompt instructions:",
        defaultValue: DEFAULT_PROMPT,
      });
      if (customInput === null) return null;
      finalPrompt = customInput.trim() || DEFAULT_PROMPT;
    }

    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 4: Report Storage Destination (output_root, error_log) ──${ANSI.reset}`);
    console.log(
      `  ${ANSI.dim}Specify where generated Markdown summaries and error logs will be stored.${ANSI.reset}\n`,
    );
    console.log(`  ${ANSI.bold}Storage Hierarchy:${ANSI.reset}`);
    console.log(`  ${ANSI.yellow}• Daily Reports:${ANSI.reset}   ${ANSI.cyan}<output_root>/<repo_name>/YYYY-MM-DD-summary.md${ANSI.reset}`);
    console.log(`  ${ANSI.green}• Date Ranges:${ANSI.reset}     ${ANSI.cyan}<output_root>/<repo_name>/YYYY-MM-DD-to-YYYY-MM-DD-summary.md${ANSI.reset}`);
    console.log(`  ${ANSI.blue}• Autocompletion:${ANSI.reset}  Type ~ or directory paths and press <Tab> to autocomplete.\n`);

    const defaultOutput = isLocal ? "./reports" : "~/reports";
    const outputInput = await promptText({
      message: "Report output directory (output_root):",
      defaultValue: defaultOutput,
      completer: "dir",
    });
    if (outputInput === null) return null;
    const outputRoot = outputInput.trim() || defaultOutput;

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
            console.log(`  ${ANSI.green}✔ Installed macOS LaunchAgent for daily run at ${scheduleTime}.${ANSI.reset}`);
          } else {
            await CronScheduler.install({ frequency: "daily", time: scheduleTime });
            console.log(`  ${ANSI.green}✔ Installed crontab job for daily run at ${scheduleTime}.${ANSI.reset}`);
          }
          scheduleInstalled = true;
        } catch (err) {
          Logger.warn(`Could not install schedule: ${String(err)}`);
        }
      }
    }

    // Write the configuration
    if (isLocal) {
      const targetFilePath = join(cwd, ".ingestrc");
      if (existsSync(targetFilePath)) {
        const overwrite = await promptConfirm({
          message: `.ingestrc already exists in ${cwd}. Overwrite?`,
          defaultYes: true,
        });
        if (!overwrite) {
          console.log(`\n${ANSI.yellow}Existing configuration preserved.${ANSI.reset}\n`);
          return targetFilePath;
        }
      }

      const repoName = isInsideGit ? await getRepoName(cwd) : "project";
      const configObj: Record<string, unknown> = {
        repo_name: repoName,
        branches: branches.length > 0 ? branches : ["main"],
        diff_mode: diffMode,
        max_diff_lines: maxDiffLines,
        default_provider: providerChoice,
        prompt: finalPrompt,
      };

      if (outputRoot !== "./reports" && outputRoot !== "~/reports") {
        configObj.output_root = outputRoot;
      }

      if (providerChoice === "opencode") {
        configObj.provider = {
          opencode: {
            model: opencodeModel,
            endpoint: opencodeEndpoint,
          },
        };
      }

      const content = `// Ingest Local Repository Configuration (.ingestrc)
// Documentation & guide: https://github.com/tsuzuku/ingest
//
// SETTINGS REFERENCE:
// • repo_name: Custom name in report headers (null = auto-detect)
// • branches: Target Git branches to analyze for commit activity
// • diff_mode: When true, extracts git diff stats & line changes (+/-)
// • max_diff_lines: Max patch lines per commit sent to AI context
// • default_provider: "antigravity" | "opencode" | "gemini-cli"
// • prompt: System prompt instructions guiding AI summary generation
${JSON.stringify(configObj, null, 2)}
`;
      await writeFile(targetFilePath, content, "utf8");
      this.printSuccessCard(targetFilePath, "Local repository configuration (.ingestrc) saved successfully.");
      return targetFilePath;
    }

    // Global config
    const targetFilePath = resolveConfiguredPath(DEFAULT_CONFIG_PATH);
    await mkdir(dirname(targetFilePath), { recursive: true });

    if (existsSync(targetFilePath)) {
      const overwrite = await promptConfirm({
        message: `Global config already exists at ${targetFilePath}. Overwrite?`,
        defaultYes: false,
      });
      if (!overwrite) {
        console.log(`\n${ANSI.yellow}Existing configuration preserved.${ANSI.reset}\n`);
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
          },
        ]
      : [];

    const globalObj: Record<string, unknown> = {
      repos,
      output_root: outputRoot,
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
      },
      prompt: finalPrompt,
    };

    const content = `// Ingest Global Configuration (~/.config/ingest/config.jsonc)
// Documentation: https://github.com/tsuzuku/ingest
//
// SETTINGS REFERENCE:
// • repos: List of repositories to analyze in headless multi-repo runs
// • output_root: Destination folder for markdown reports (<root>/<repo>/YYYY-MM-DD-summary.md)
// • error_log: Path for recording non-fatal error traces (default: error.log)
// • default_provider: Default AI backend ("antigravity" | "opencode" | "gemini-cli")
// • provider: Custom provider configs (endpoints, model overrides, tokens)
// • prompt: Default engineering analysis prompt template
${JSON.stringify(globalObj, null, 2)}
`;
    await writeFile(targetFilePath, content, "utf8");
    this.printSuccessCard(targetFilePath, "Global configuration saved successfully to ~/.config/ingest/config.jsonc.");
    return targetFilePath;
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
