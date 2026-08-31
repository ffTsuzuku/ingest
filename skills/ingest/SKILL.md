---
name: ingest
description: >-
  Interactive Git activity report generator, markdown viewer, scheduler wizard,
  and AI-assisted commit analyzer. Use when the user asks to generate daily git summaries,
  view historical repo reports, manage cron/launchd schedules, or configure repository analysis.
---

# Ingest CLI Skill

`ingest` is an AI-powered tool for summarizing Git activity, inspecting commit histories with deep-dive diff statistics, managing automated report schedules, and viewing reports in the terminal.

## Key Capabilities

1. **Interactive TUI Mode & Setup Wizard**:
   - Run interactive menu or guided configuration wizard:
     ```bash
     ingest
     ingest --init
     ingest --init --quick
     ```
   - Features real-time AI agent/harness discovery (`agy`, `claude`, `codex`, `pi`, `opencode`, `gemini`, `ollama`, `aider`, or custom), arrow-key navigation, interactive date selectors, markdown report explorer with terminal pager, and scheduler setup.

2. **Headless Batch Generation**:
   - Generate reports for all configured repositories:
     ```bash
     ingest
     ```
   - Generate multi-repository workspace rollup summary across all configured repositories:
     ```bash
     ingest --rollup
     ingest --rollup --date 2026-04-05
     ```
   - Generate report for a specific repository on a specific date or date range:
     ```bash
     ingest --repo /path/to/repo --date 2026-04-05
     ingest --repo /path/to/repo --date 2026-04-01..2026-04-07
     ingest --repo /path/to/repo --since 2026-04-01 --until 2026-04-07
     ```
   - When multiple branches are configured (e.g. `["main", "dev"]`), `ingest` generates dedicated reports per each branch (e.g. `YYYY-MM-DD-main-summary.md` and `YYYY-MM-DD-dev-summary.md`).
   - Enable deep-dive code diff analysis and select report styles:
     ```bash
     ingest --repo /path/to/repo --diff
     ingest --repo /path/to/repo --style system-centric
     ```
   - Automatically tracks exact model prompt and completion tokens in generated reports (with N/A fallback when unrecorded).

3. **Git Revision & Branch Comparison**:
   - Compare arbitrary Git branches, tags, or commit revisions without temporal filtering:
     ```bash
     ingest --compare main..feature
     ingest --compare origin/main...HEAD
     ingest --compare v1.0.0..v2.0.0
     ingest --repo /path/to/repo --compare main..feature
     ```
   - Extracts commit ranges, diff statistics, and patch excerpts between the two references to generate structured comparison reports.

4. **Web Browser Report Explorer & Dashboard**:
   - Serve an interactive web dashboard across all repositories in the centralized report store:
     ```bash
     ingest --ui
     ingest --ui --port 3456
     ingest --ui --no-open
     ```
   - Features live token badges (`⚡ 14.1k tokens` / `⚡ Tokens: N/A`), timeline switcher, and one-click AI Mermaid syntax repair (`✨ Fix Diagrams`).

5. **Terminal Markdown Viewer & Diagram Repair**:
   - View generated markdown reports directly in the terminal with ANSI styling, responsive table wrapping, and 2D Unicode Mermaid diagrams:
     ```bash
     ingest --view /path/to/report.md
     ```
   - Repair and heal broken Mermaid diagram syntax via AI directly from the CLI:
     ```bash
     ingest --fix-diagrams /path/to/report.md
     ```
   - In the pager, press `m` to toggle Mermaid rendering between **2D Connected Box Flowcharts** and **Structured Component & Flow Lists**.

6. **Report Expiration & Maintenance**:
   - Prune expired reports based on configured retention period (default: 30 days):
     ```bash
     ingest clean
     ingest clean --days 14
     ingest --clean
     ```

7. **Automated Scheduling (macOS launchd & Linux Cron)**:
   - Install or view automated daily schedule (with optional automatic expiration):
     ```bash
     ingest --schedule-install --time 00:00
     ingest --schedule-install --time 00:00 --expires 2026-09-30
     ingest --schedule-install --time 00:00 --expire-days 14
     ingest --schedule-status
     ingest --schedule-remove
     ```

8. **Global Skill Installer**:
   - Install or update this AI skill into the user's global agent directory:
     ```bash
     ingest --install-skill
     ```

## Configuration Architecture

`ingest` supports hierarchical configurations:
1. **Global Configuration** (`~/.config/ingest/config.jsonc`):
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
      "diff_ignore_patterns": ["*.gen.ts", "fixtures/**"],
      "smart_diff_filter": true
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

2. **Local Repository Configuration** (`.ingestrc` or `ingest.config.jsonc` in any project root):
```jsonc
{
  "repo_name": "custom-name",
  "branches": ["main", "feature/v2"],
  "custom_prompt": "Focus on API breaking changes and database migrations.",
  "report_style": "system-centric",
  "diff_mode": true,
  "max_diff_lines": 300,
  "diff_ignore_patterns": ["generated/**", "mocks/**"],
  "smart_diff_filter": true,
  "retention_days": 30
}
```


### Smart Diff Filtering & Signal Prioritization
- **Noise Filtering**: Automatically ignores lockfiles (`package-lock.json`, `yarn.lock`, `Cargo.lock`, `go.sum`, etc.), build artifacts (`*.min.js`, `*.map`, `.tsbuildinfo`), snapshots (`*.snap`), and media/binary assets.
- **Custom Patterns**: Configure `diff_ignore_patterns` in `.ingestrc` or `config.jsonc` for project-specific generated files.
- **Toggle**: Disable built-in noise filtering via `"smart_diff_filter": false` if full raw diff context is required.
- **Signal Prioritization**: When diffs are truncated to fit `max_diff_lines`, high-signal architecture manifests and core source files are prioritized over test fixtures, scripts, and localization.

## How to Assist Users

- When the user wants a summary of today's work or a specific time period, suggest running `ingest` in the current directory or specifying `--date YYYY-MM-DD` or `--date YYYY-MM-DD..YYYY-MM-DD`.
- When the user wants a cross-repository executive summary or multi-system engineering rollup, suggest running `ingest --rollup`.
- When the user wants automated nightly reports, guide them through `ingest --schedule-install` or the interactive TUI Scheduler Wizard.
- When the user wants to customize AI prompts or branch targets per repo, suggest creating a local `.ingestrc` file in the repo root or updating `~/.config/ingest/config.jsonc`.

