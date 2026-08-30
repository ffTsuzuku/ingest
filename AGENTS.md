# AGENTS.md - Git Ingest Developer & AI Agent Guide

Welcome to `git-ingest`. This repository is designed to be **AI-first, highly modular, and zero-dependency**.

## 1. Codebase Overview

- **Main Entrypoint**: [`src/index.ts`](file:///Users/tsuzuku/Git/ingest/main/src/index.ts) - CLI flag router and execution orchestrator.
- **Interactive TUI**: [`src/tui/menu.ts`](file:///Users/tsuzuku/Git/ingest/main/src/tui/menu.ts), [`src/tui/prompt.ts`](file:///Users/tsuzuku/Git/ingest/main/src/tui/prompt.ts), [`src/tui/pager.ts`](file:///Users/tsuzuku/Git/ingest/main/src/tui/pager.ts), [`src/tui/ansi.ts`](file:///Users/tsuzuku/Git/ingest/main/src/tui/ansi.ts).
- **Configuration Engine**: [`src/config/parser.ts`](file:///Users/tsuzuku/Git/ingest/main/src/config/parser.ts), [`src/config/manager.ts`](file:///Users/tsuzuku/Git/ingest/main/src/config/manager.ts), [`src/config/types.ts`](file:///Users/tsuzuku/Git/ingest/main/src/config/types.ts).
- **Git Analytics**: [`src/git/log.ts`](file:///Users/tsuzuku/Git/ingest/main/src/git/log.ts), [`src/git/diff.ts`](file:///Users/tsuzuku/Git/ingest/main/src/git/diff.ts), [`src/git/runner.ts`](file:///Users/tsuzuku/Git/ingest/main/src/git/runner.ts).
- **AI Providers**: [`src/ai/factory.ts`](file:///Users/tsuzuku/Git/ingest/main/src/ai/factory.ts), [`src/ai/opencode.ts`](file:///Users/tsuzuku/Git/ingest/main/src/ai/opencode.ts), [`src/ai/gemini-cli.ts`](file:///Users/tsuzuku/Git/ingest/main/src/ai/gemini-cli.ts), [`src/ai/prompt.ts`](file:///Users/tsuzuku/Git/ingest/main/src/ai/prompt.ts).
- **Report Engine & Viewer**: [`src/report/generator.ts`](file:///Users/tsuzuku/Git/ingest/main/src/report/generator.ts), [`src/report/storage.ts`](file:///Users/tsuzuku/Git/ingest/main/src/report/storage.ts), [`src/report/viewer.ts`](file:///Users/tsuzuku/Git/ingest/main/src/report/viewer.ts).
- **Automation & Schedulers**: [`src/scheduler/launchd.ts`](file:///Users/tsuzuku/Git/ingest/main/src/scheduler/launchd.ts), [`src/scheduler/cron.ts`](file:///Users/tsuzuku/Git/ingest/main/src/scheduler/cron.ts).
- **Skill Installer**: [`src/skill/installer.ts`](file:///Users/tsuzuku/Git/ingest/main/src/skill/installer.ts), [`skills/git-ingest/SKILL.md`](file:///Users/tsuzuku/Git/ingest/main/skills/git-ingest/SKILL.md).

---

## 2. Core Development Rules

1. **Zero External Runtime Dependencies**: Never introduce external npm packages for runtime tasks (use Node.js built-ins: `node:fs/promises`, `node:child_process`, `node:readline`, `node:path`, `node:os`).
2. **Self-Documentation Rule**: Whenever changes are made to CLI arguments, configuration schemas, or module interfaces, you MUST update:
   - [`README.md`](file:///Users/tsuzuku/Git/ingest/main/README.md)
   - [`docs/architecture.md`](file:///Users/tsuzuku/Git/ingest/main/docs/architecture.md)
   - [`skills/git-ingest/SKILL.md`](file:///Users/tsuzuku/Git/ingest/main/skills/git-ingest/SKILL.md)
3. **Automated Verification**: Always verify with `npm run verify-docs` and `npm test` before concluding tasks.
4. **Resilient Error Logging**: Non-fatal failures (such as a single repo failing or an AI provider timing out) must be logged via `Logger.error()` and written to `error.log` while allowing other repo operations to proceed.

---

## 3. Essential Commands

```bash
# Typecheck
npm run check

# Run tests
npm test

# Verify documentation and codebase integrity
npm run verify-docs

# Install global AI skill for Antigravity & Gemini CLI
npm run install-skill
```
