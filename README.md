# git-ingest

> AI-powered Git repository daily report generator, interactive TUI, diff deep-dive explorer, and automated scheduling suite.

---

## 🚀 Features

- 🖥️ **Interactive Zero-Dependency TUI/CLI**: Interactive terminal menus, arrow navigation, fuzzy repo selection, custom date pickers, and live AI connection testing built with pure Node.js native standard libraries.
- 📖 **Terminal Markdown Viewer & Pager**: Built-in ANSI markdown reader with headers, bullet points, syntax-highlighted code blocks, diff statistics, and scrollable pager (`Up`/`Down`, `PgUp`/`PgDn`, `q`).
- 🔍 **Git Diff Deep-Dive Mode**: Analyzes commit logs alongside file impact statistics (`git diff --stat`), line changes (+/-), and patch excerpts.
- ⏰ **Automated Schedulers (macOS LaunchAgent + Linux Cron)**: Install, manage, test, and inspect recurring daily report jobs seamlessly.
- 🤖 **Global AI Skill Deployment**: Installs standard AI skill files (`skills/git-ingest/SKILL.md`) to `~/.gemini/config/skills/git-ingest/` so AI assistants can directly assist users.
- ⚙️ **JSONC Configuration**: Clean configuration with comment support, custom prompt templates per repo, and support for Opencode CLI and Gemini CLI.

---

## 📦 Installation & Quickstart

No runtime dependencies required!

```bash
# Launch interactive TUI
npx ts-node src/index.ts

# Or run headless daily summary for all configured repos
npx ts-node src/index.ts ~/.config/git-ingest/config.jsonc
```

---

## 🛠️ CLI Usage

```bash
# Launch interactive TUI menu
git-ingest

# Run report for a specific repository on a specific date
git-ingest --repo /path/to/repo --date 2026-04-05

# Enable deep-dive code diff analysis
git-ingest --repo /path/to/repo --diff

# View any markdown report in the terminal pager
git-ingest --view ~/reports/my-repo/2026-04-05-summary.md

# Deploy AI Skill to ~/.gemini/config/skills/git-ingest/
git-ingest --install-skill

# Scheduler automation
git-ingest --schedule-install --time 00:00
git-ingest --schedule-status
git-ingest --schedule-remove
```

---

## ⚙️ Configuration (`~/.config/git-ingest/config.jsonc`)

```jsonc
{
  "repos": [
    {
      "path": "/path/to/repo",
      "repo_name": null, // null = auto basename
      "branches": ["main", "dev"],
      "custom_prompt": null,
      "diff_mode": true
    }
  ],
  "output_root": "~/reports",
  "error_log": "error.log",
  "default_provider": "opencode",
  "provider": {
    "opencode": {
      "model": "qwen-max",
      "endpoint": "http://localhost:1234/v1/chat/completions",
      "api_key_env": null
    },
    "gemini-cli": {
      "model": "gemini-1.5-flash",
      "gemini_api_key_file": "~/.config/gemini-api-key.json"
    }
  },
  "prompt": "Summarize repo activity from last 24h: commit messages, authors, key patterns, overall narrative."
}
```

---

## 📚 Documentation

- [Architecture Specification](file:///Users/tsuzuku/Git/ingest/main/docs/architecture.md)
- [Coding Standards & TypeScript Guidelines](file:///Users/tsuzuku/Git/ingest/main/docs/coding-standards.md)
- [Extension Guide](file:///Users/tsuzuku/Git/ingest/main/docs/extension-guide.md)
- [Self-Documentation Protocol](file:///Users/tsuzuku/Git/ingest/main/docs/self-documentation.md)
