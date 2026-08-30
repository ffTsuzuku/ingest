# ingest

> AI-powered Git repository daily report generator, interactive TUI, diff deep-dive explorer, and automated scheduling suite.

---

## 🚀 Features

- 🖥️ **Interactive Zero-Dependency TUI/CLI**: Interactive terminal menus, arrow navigation, fuzzy repo selection, custom date pickers, and live AI connection testing built with pure Node.js native standard libraries.
- 📖 **Terminal Markdown Viewer & Pager**: Built-in ANSI markdown reader with headers, bullet points, syntax-highlighted code blocks, diff statistics, and scrollable pager (`Up`/`Down`, `PgUp`/`PgDn`, `q`).
- 🔍 **Git Diff Deep-Dive Mode**: Analyzes commit logs alongside file impact statistics (`git diff --stat`), line changes (+/-), and patch excerpts.
- ⏰ **Automated Schedulers (macOS LaunchAgent + Linux Cron)**: Install, manage, test, and inspect recurring daily report jobs seamlessly.
- 🤖 **Global AI Skill Deployment**: Installs standard AI skill files (`skills/ingest/SKILL.md`) to `~/.gemini/config/skills/ingest/` so AI assistants can directly assist users.
- ⚙️ **JSONC Configuration**: Clean configuration with comment support, custom prompt templates per repo, and support for Antigravity CLI, Opencode CLI, and Gemini CLI.

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

# Interactive setup wizard with guided explanations
ingest --init

# Quick setup with smart defaults (.ingestrc in project root)
ingest --init --quick

# Run headless report generation for all configured repos
ingest ~/.config/ingest/config.jsonc

# Run report for a specific repository on a specific date
ingest --repo /path/to/repo --date 2026-04-05

# Run report for a date range (e.g. weekly summary)
ingest --repo /path/to/repo --date 2026-04-01..2026-04-07
ingest --repo /path/to/repo --since 2026-04-01 --until 2026-04-07

# Enable deep-dive code diff analysis
ingest --repo /path/to/repo --diff

# View any markdown report in the terminal pager
ingest --view ~/reports/my-repo/2026-04-05-summary.md

# Deploy AI Skill to ~/.gemini/config/skills/ingest/
ingest --install-skill

# Scheduler automation
ingest --schedule-install --time 00:00
ingest --schedule-status
ingest --schedule-remove
```

---

## ⚙️ Configuration

`ingest` supports a hierarchical configuration system:

1. **Global Configuration** (`~/.config/ingest/config.jsonc`): Defines machine-wide defaults, AI provider settings, output directories, and default repository lists.
2. **Local Repository Configuration** (`.ingestrc` or `ingest.config.jsonc` in any repo root): Overrides target branches, custom prompts, diff limits, or output directories specific to that repository.

### Global Configuration (`~/.config/ingest/config.jsonc`)

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

### Local Repository Configuration (`.ingestrc` or `ingest.config.jsonc`)

Place `.ingestrc` in the root of your project to specify repo-specific review rules:

```jsonc
// .ingestrc in project root
{
  "repo_name": "my-service",
  "branches": ["main", "feature/next"],
  "custom_prompt": "Focus on API contract breaking changes and database schema migrations.",
  "diff_mode": true,
  "max_diff_lines": 300
}
```

---

## 📚 Documentation

- [Architecture Specification](file:///Users/tsuzuku/Git/ingest/main/docs/architecture.md)
- [Coding Standards & TypeScript Guidelines](file:///Users/tsuzuku/Git/ingest/main/docs/coding-standards.md)
- [Extension Guide](file:///Users/tsuzuku/Git/ingest/main/docs/extension-guide.md)
- [Self-Documentation Protocol](file:///Users/tsuzuku/Git/ingest/main/docs/self-documentation.md)
