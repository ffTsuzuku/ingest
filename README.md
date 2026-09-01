# ingest

> AI-powered Git repository daily report generator, interactive TUI, diff deep-dive explorer, and automated scheduling suite.

---

## 🚀 Features

- 🖥️ **Interactive Zero-Dependency TUI/CLI**: Interactive terminal menus, arrow navigation, repository-organized report explorer, real-time search/filtering (by date, branch, keyword, or report style), interactive report deletion (single report action menu or batch multi-selection), fuzzy repo selection, custom date pickers, and live AI connection testing built with pure Node.js native standard libraries.
- 🌐 **Web Browser Dashboard & Report Explorer (`--ui`)**: Lightweight, zero-dependency HTTP server (`node:http`) serving a responsive single-page application to browse, filter, search, delete (`🗑️ Delete` / `d`), copy, and read reports across all repositories in your shared report store.
- 📖 **Terminal Markdown Viewer & Pager**: Built-in ANSI markdown reader with headers, bullet points, syntax-highlighted code blocks, diff statistics, responsive table auto-wrapping, and scrollable pager (`Up`/`Down`, `PgUp`/`PgDn`, `q`). Organizes reports per-repository with count badges and live search filtering.
- 🔀 **Git Revision & Branch Comparison (`--compare <base>..<target>`)**: Compare arbitrary Git branches, tags, or revisions (e.g. `main..feature`, `origin/main...HEAD`, `v1.0.0..v2.0.0`) without requiring temporal date filtering. Analyzes commit history, diff statistics, and patch excerpts between the two references to generate structured comparison reports.
- 🏢 **Multi-Repo Workspace Rollup (`--rollup`)**: Collects and synthesizes engineering activity across all configured repositories in your workspace into a unified cross-repo executive digest (`<output_root>/_workspace/YYYY-MM-DD-rollup-summary.md`), highlighting inter-service architectural impacts, API contract updates, stack-wide risks, and activity matrices.
- 🌿 **Branch-Isolated Reports**: When a repository monitors multiple branches (e.g. `branches: ["main", "dev"]`), `ingest` analyzes and generates dedicated individual reports for each branch (e.g. `YYYY-MM-DD-main-summary.md` and `YYYY-MM-DD-dev-summary.md`) rather than merging them into a single report.
- ⚡ **Token Usage Tracking**: Accurately tracks exact model prompt and completion tokens directly via provider session metrics (such as `agy --output-format json`), embedding token counts directly into report footers, Web UI badges, and CLI logs (with `N/A` fallback for unrecorded reports).
- 📄 **Multi-Format Report Export (`--format json|html|slack`)**: Generates reports in Markdown, structured JSON (`.json`), standalone styled HTML documents (`.html`), or Slack-compatible mrkdwn (`.txt`) for easy sharing across teams and messaging channels.
- ⚡ **Parallel Multi-Repo Processing**: Bounded concurrent processing (`pooledMap`) analyzes multiple repositories in parallel with clean log prefixing and memory-safe diff buffering.
- 🔍 **Git Diff Deep-Dive Mode**: Analyzes commit logs alongside file impact statistics (`git diff --stat`), line changes (+/-), and patch excerpts.
- ⏰ **Automated Schedulers (macOS LaunchAgent + Linux Cron)**: Install, manage, test, and inspect recurring daily report jobs seamlessly.
- 🤖 **Dynamic AI Agent & Harness Discovery**: Automatically probes the environment for installed agent harnesses (`agy`, `claude`, `codex`, `pi`, `opencode`, `gemini`, `ollama`, `aider`, or custom commands) with real-time `[Detected ✔]` status badges and automatic pre-selection in setup wizards.
- ⚙️ **JSONC Configuration**: Clean configuration with comment support, custom prompt templates per repo, and support for Antigravity, Claude Code, Codex, Pi, Opencode, Gemini, Ollama, Aider, and custom CLI harnesses.

---

## 📦 Installation & Quickstart

Install globally via npm:

```bash
npm install -g ingest
```

Or execute directly with npx:

```bash
npx ingest
```

### Development & Local Setup

```bash
# Clone and build
git clone <repo-url>
cd ingest
npm install
npm run build

# Launch interactive TUI
npm start
```

---

## 🛠️ CLI Usage

```bash
# Launch interactive TUI menu
ingest

# Launch Web UI browser dashboard (auto-focuses current repo, browses all repos in store)
ingest --ui
ingest --ui --port 8080
ingest --ui --no-open

# Interactive setup wizard with guided explanations
ingest --init

# Quick setup with smart defaults (.ingestrc in project root)
ingest --init --quick

# Run headless report generation for all configured repos
ingest ~/.config/ingest/config.jsonc

# Generate summary of today's git activity (from 00:00 local time)
ingest --today
ingest --repo /path/to/repo --today

# Generate cross-repository executive workspace rollup digest
ingest --rollup
ingest --rollup --date 2026-04-05
ingest --rollup --date 2026-04-01..2026-04-07

# Run report for a specific repository on a specific date
ingest --repo /path/to/repo --date 2026-04-05

# Compare Git branches, tags, or revisions
ingest --compare main..feature
ingest --compare origin/main...HEAD
ingest --compare v1.0.0..v2.0.0
ingest --repo /path/to/repo --compare main..feature

# Run report for a date range (e.g. weekly summary)
ingest --repo /path/to/repo --date 2026-04-01..2026-04-07
ingest --repo /path/to/repo --since 2026-04-01 --until 2026-04-07

# Enable deep-dive code diff analysis
ingest --repo /path/to/repo --diff

# Select report style preset ("system-centric" | "default" | "changelog" | "security")
ingest --repo /path/to/repo --style system-centric

# Multi-format report export (markdown, json, html, or slack mrkdwn)
ingest --repo /path/to/repo --format json
ingest --repo /path/to/repo --format html
ingest --repo /path/to/repo --format slack

# Inspect and repair Mermaid diagram syntax with AI
ingest --fix-diagrams ~/reports/my-repo/2026-04-05-summary.md

# Prune expired reports (default: older than 30 days)
ingest clean
ingest clean --days 14
ingest --clean

# View any markdown report in the terminal pager
ingest --view ~/reports/my-repo/2026-04-05-summary.md

# Deploy AI Skill to ~/.gemini/config/skills/ingest/
ingest --install-skill

# Scheduler automation (Daily, Weekdays, Weekends, Custom Days, Hourly, Cron)
ingest --schedule-install --time 00:00
ingest --schedule-install --frequency weekdays --time 18:00
ingest --schedule-install --days 1,3,5 --time 09:30
ingest --schedule-install --frequency hourly --interval-hours 3
ingest --schedule-install --cron "30 9 * * 1-5"
ingest --schedule-install --time 00:00 --expires 2026-09-30
ingest --schedule-install --time 00:00 --expire-days 14
ingest --schedule-status
ingest --schedule-remove
```

---


### Smart Diff Filtering & Signal Prioritization

`ingest` includes an intelligent diff noise filtering and prioritization engine:

- **Automatic Noise Filtering (`smart_diff_filter: true` by default)**: Automatically strips out low-signal, high-churn files from AI prompts:
  - **Lockfiles**: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, `go.sum`, `composer.lock`, `Gemfile.lock`, `flake.lock`, `poetry.lock`, `Pipfile.lock`, `bun.lockb`, etc.
  - **Build Artifacts & Metadata**: `*.min.js`, `*.min.css`, `*.bundle.js`, `*.map`, `*.d.ts.map`, `.tsbuildinfo`, etc.
  - **Binary & Media Assets**: `*.png`, `*.jpg`, `*.webp`, `*.svg`, `*.mp4`, `*.wasm`, `*.pdf`, `*.zip`, `*.tar.gz`, etc.
  - **Test Snapshots**: `*.snap`, `*.snapshot`, `*.snap.json`.
- **Custom Ignore Patterns (`diff_ignore_patterns`)**: Specify glob or exact patterns in `.ingestrc` or global config (e.g. `["*.gen.ts", "fixtures/**"]`).
- **Signal-Based Prioritization**: When diff output exceeds `max_diff_lines`, diff lines are prioritized by architectural value (Configuration Manifests & Workflows > Entrypoints > Core Source Code > API Specs > Documentation > Tests > Tooling Scripts > Styles > Fixtures > Localization).

## ⚙️ Configuration

`ingest` supports a hierarchical configuration system:

1. **Global Configuration** (`~/.config/ingest/config.jsonc`): Defines machine-wide defaults, AI provider settings, report style presets, output directories, report expiration periods, and default repository lists.
2. **Local Repository Configuration** (`.ingestrc` or `ingest.config.jsonc` in any repo root): Overrides target branches, custom prompts, report style preset, diff limits, retention periods, or output directories specific to that repository.

### Global Configuration (`~/.config/ingest/config.jsonc`)

```jsonc
{
  "repos": [
    {
      "path": "/path/to/repo",
      "repo_name": null, // null = auto detect from Git remote origin or repository name
      "branches": ["main", "dev"],
      "custom_prompt": null,
      "report_style": "system-centric", // "default" | "system-centric" | "changelog" | "security"
      "diff_mode": true,
      "max_diff_lines": 200,
      "diff_ignore_patterns": ["*.gen.ts", "docs/auto/**"],
      "smart_diff_filter": true,
      "file_priorities": {
        "high": ["*.tf", "*.proto", "Dockerfile*"],
        "low": ["*.generated.ts", "locales/**"]
      }
    }
  ],
  "output_root": "~/reports",
  "retention_days": 30, // Report retention period in days (0 = keep forever)
  "error_log": "error.log",
  "default_provider": "antigravity",
  "report_style": "system-centric",
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
  "prompt": "Perform an engineering deep dive into repo activity over the last 24h: architectural patterns, key implementation mechanics, code diff analysis, and technical impact."
}
```

### Local Repository Configuration (`.ingestrc` or `ingest.config.jsonc`)

Place `.ingestrc` in the root of your project to specify repo-specific review rules:

```jsonc
// .ingestrc in project root
{
  "repo_name": "my-service",
  "branches": ["main", "feature/next"],
  "custom_prompt": "Focus on API contract breaking changes and database schema migrations.",
  "report_style": "system-centric",
  "diff_mode": true,
  "max_diff_lines": 300,
  "diff_ignore_patterns": ["generated/**", "fixtures/*.json"],
  "smart_diff_filter": true,
  "retention_days": 30
}
```

---

## 📚 Documentation

- [Architecture Specification](file:///Users/tsuzuku/Git/ingest/main/docs/architecture.md)
- [Coding Standards & TypeScript Guidelines](file:///Users/tsuzuku/Git/ingest/main/docs/coding-standards.md)
- [Extension Guide](file:///Users/tsuzuku/Git/ingest/main/docs/extension-guide.md)
- [Self-Documentation Protocol](file:///Users/tsuzuku/Git/ingest/main/docs/self-documentation.md)
