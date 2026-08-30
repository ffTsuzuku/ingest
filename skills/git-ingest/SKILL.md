---
name: git-ingest
description: >-
  Interactive Git activity report generator, markdown viewer, scheduler wizard,
  and AI-assisted commit analyzer. Use when the user asks to generate daily git summaries,
  view historical repo reports, manage cron/launchd schedules, or configure repository analysis.
---

# Git Ingest CLI Skill

`git-ingest` is an AI-powered tool for summarizing Git activity, inspecting commit histories with deep-dive diff statistics, managing automated report schedules, and viewing reports in the terminal.

## Key Capabilities

1. **Interactive TUI Mode**:
   - Run without arguments in any terminal:
     ```bash
     npx ts-node src/index.ts
     ```
   - Features arrow-key navigation, interactive date selectors, markdown report explorer with terminal pager, and scheduler setup.

2. **Headless Batch Generation**:
   - Generate reports for all configured repositories:
     ```bash
     npx ts-node src/index.ts
     ```
   - Generate report for a specific repository on a specific date:
     ```bash
     npx ts-node src/index.ts --repo /path/to/repo --date 2026-04-05
     ```
   - Enable deep-dive code diff analysis:
     ```bash
     npx ts-node src/index.ts --repo /path/to/repo --diff
     ```

3. **Report Explorer & Terminal Markdown Viewer**:
   - View generated markdown reports directly in the terminal with ANSI styling:
     ```bash
     npx ts-node src/index.ts --view /path/to/report.md
     ```

4. **Automated Scheduling (macOS launchd & Linux Cron)**:
   - Install or view automated daily schedule:
     ```bash
     npx ts-node src/index.ts --schedule-install --time 00:00
     npx ts-node src/index.ts --schedule-status
     npx ts-node src/index.ts --schedule-remove
     ```

5. **Global Skill Installer**:
   - Install or update this AI skill into the user's global agent directory:
     ```bash
     npx ts-node src/index.ts --install-skill
     ```

## Configuration Format (`~/.config/git-ingest/config.jsonc`)

```jsonc
{
  "repos": [
    {
      "path": "/path/to/repo",
      "repo_name": null, // null = basename
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
  "prompt": "Summarize repo activity from last 24h: commit messages, authors, key patterns, overall narrative."
}
```

## How to Assist Users

- When the user wants a summary of today's work, suggest running `git-ingest` in the current directory or specifying `--date YYYY-MM-DD`.
- When the user wants automated nightly reports, guide them through `git-ingest --schedule-install` or the interactive TUI Scheduler Wizard.
- When the user wants to customize AI prompts per repo, update the `custom_prompt` or `custom_prompt_file` attribute in `~/.config/git-ingest/config.jsonc`.
