# Coding Standards & Guidelines

This document outlines the coding standards, TypeScript conventions, and quality practices for the `git-ingest` codebase.

## 1. Core Principles

1. **Zero External Runtime Dependencies**: All runtime functionality (parsing JSONC, ANSI formatting, terminal interactive menus, Git spawning, scheduler setup) must use Node.js built-in APIs (`node:fs/promises`, `node:child_process`, `node:readline`, `node:path`, `node:os`, `node:events`, etc.).
2. **Explicit Type Safety**: Strict TypeScript settings (`noImplicitAny`, `strictNullChecks`, `exactOptionalPropertyTypes`) are enforced. Avoid using `any` - use generics, unions, or `unknown` with type guards instead.
3. **Graceful Error Handling & Non-Blocking Execution**: Failures in one repository, branch, or AI call must not crash the whole process. Errors should be caught, recorded in error logs, and clearly displayed to the user.
4. **Clean Decoupling**: Keep UI/TUI, Git operations, AI providers, schedulers, and configuration completely separated behind clean interfaces.

---

## 2. Code Organization

```
src/
├── config/       # Schema, JSONC parser, defaults, persistence
├── git/          # Git CLI runner, commit log parser, diff deep-dive engine
├── ai/           # AI provider adapters (Opencode, Gemini CLI), prompt builders
├── report/       # Report formatters, file storage, terminal markdown viewer
├── scheduler/    # macOS launchd and Linux crontab management
├── skill/        # AI Skill installer for Antigravity & Gemini CLI
├── tui/          # Zero-dep ANSI colors, interactive keyboard menus, pager
├── utils/        # Logger, doc validator, string helpers
└── index.ts      # Main CLI router and entrypoint
```

---

## 3. TypeScript Conventions

### 3.1. Imports
- Always use the `node:` prefix for Node.js standard library imports:
  ```typescript
  import { spawn } from "node:child_process";
  import { readFile, writeFile } from "node:fs/promises";
  import { join, resolve } from "node:path";
  ```
- Use named exports for modules and types.

### 3.2. Types vs Interfaces
- Use `interface` for object structures that can be extended or implemented (e.g. `AIProvider`, `CommitRecord`).
- Use `type` for unions, aliases, utility types, and function signatures:
  ```typescript
  export type DateRange = { since: string; until?: string };
  export type LogLevel = "info" | "warn" | "error" | "debug";
  ```

### 3.3. Async / Await
- Never use synchronous file operations (`fs.readFileSync`, `fs.writeFileSync`) in core business logic. Always use `node:fs/promises`.
- Always wrap child processes with promise-based helpers with standard timeout and buffer handling.

---

## 4. Error Handling & Logging

- Every module must throw typed error instances or return structured results (`{ ok: boolean, error?: string }`).
- Catch errors at boundary layers (e.g., repository processing loops, AI provider calls) and route them through `Logger`:
  ```typescript
  import { Logger } from "../utils/logger.js";

  try {
    const report = await generateRepoReport(repoConfig);
  } catch (err) {
    await Logger.error(`Failed to process repo ${repoConfig.path}`, err);
  }
  ```
- Terminal outputs for user-facing errors must be clean, human-readable ANSI styled summaries without raw stack trace dumps, while detailed traces are appended to `error.log`.

---

## 5. Documentation Maintenance

When adding new features or modifying existing logic:
1. Update `docs/architecture.md` if components or data flows change.
2. Update `docs/extension-guide.md` when adding new providers or commands.
3. Update `skills/git-ingest/SKILL.md` if new user-facing commands, flags, or configuration options are introduced.
4. Run `npm run verify-docs` to ensure documentation consistency.
