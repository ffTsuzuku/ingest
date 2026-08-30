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

1. **Interactive TUI Mode**:
   - Run without arguments in any terminal:
     ```bash
     ingest
     ```
   - Features arrow-key navigation, interactive date selectors, markdown report explorer with terminal pager, and scheduler setup.

2. **Headless Batch Generation**:
   - Generate reports for all configured repositories:
     ```bash
     ingest
     ```
   - Generate report for a specific repository on a specific date:
     ```bash
     ingest --repo /path/to/repo --date 2026-04-05
     ```
   - Enable deep-dive code diff analysis:
     ```bash
     ingest --repo /path/to/repo --diff
     ```

3. **Report Explorer & Terminal Markdown Viewer**:
   - View generated markdown reports directly in the terminal with ANSI styling:
     ```bash
     ingest --view /path/to/report.md
     ```

4. **Automated Scheduling (macOS launchd & Linux Cron)**:
   - Install or view automated daily schedule:
     ```bash
     ingest --schedule-install --time 00:00
     ingest --schedule-status
     ingest --schedule-remove
     ```

5. **Global Skill Installer**:
   - Install or update this AI skill into the user's global agent directory:
     ```bash
     ingest --install-skill
     ```

## Configuration Format (`~/.config/ingest/config.jsonc`)

```jsonc
{
  "repos": [
    {
      "path": "/path/to/repo",
      "repo_name": null, // null = auto detect from Git remote origin or repository name
      "branches": ["main", "dev"],
      "custom_prompt": null,
      "diff_mode": true
    }
  ],
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
  "prompt": "Perform an engineering deep dive into repo activity over the last 24h: architectural patterns, key implementation mechanics, code diff analysis, and technical impact."
}
```

## How to Assist Users

- When the user wants a summary of today's work, suggest running `ingest` in the current directory or specifying `--date YYYY-MM-DD`.
- When the user wants automated nightly reports, guide them through `ingest --schedule-install` or the interactive TUI Scheduler Wizard.
- When the user wants to customize AI prompts per repo, update the `custom_prompt` or `custom_prompt_file` attribute in `~/.config/ingest/config.jsonc`.
