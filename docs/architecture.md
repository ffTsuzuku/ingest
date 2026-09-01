# Ingest Architecture Specification

This document describes the architectural layers, module responsibilities, and data flows of `ingest`.

## 1. System Overview

`ingest` is an AI-first developer tool that inspects Git repository histories, performs multi-commit AI analysis, generates structured markdown reports, and offers an interactive zero-dependency terminal UI and automated scheduling suite.

```mermaid
graph TD
    CLI[CLI Entrypoint: src/index.ts] --> Router{Interactive or Headless?}
    Router -->|No Args / TUI Flag| TUI[TUI Menu System: src/tui/menu.ts]
    Router -->|Args / Cron / Flags| Runner[Headless Pipeline: src/index.ts]
    
    TUI --> ConfigMgr[Config Manager: src/config/manager.ts]
    Runner --> ConfigMgr
    
    TUI --> GitEng[Git Engine: src/git/log.ts & diff.ts]
    Runner --> GitEng
    
    TUI --> AIEng[AI Engine: src/ai/factory.ts]
    Runner --> AIEng
    
    TUI --> Viewer[Terminal Markdown Viewer: src/report/viewer.ts]
    TUI --> Scheduler[Scheduler Wizard: src/scheduler/]
    TUI --> SkillInst[Skill Installer: src/skill/installer.ts]
    
    AIEng --> RepGen[Report Generator: src/report/generator.ts]
    RepGen --> RepStore[Report Storage: src/report/storage.ts]
```

---

## 2. Module Responsibilities

### 2.1. `src/cli/`
- **`parser.ts`**: CLI argument tokenizer, flag router, alias mapper, and styled terminal help text renderer (`parseCliArgs`, `printHelp`, `ParsedArgs`).

### 2.2. `src/config/`
- **`types.ts`**: Formal schemas for `AppConfig`, `RepoConfig`, `LocalRepoConfig`, `ProviderConfigMap`, `RawConfig`, `ReportStyle`, and `file_priorities` overrides (including `diff_ignore_patterns`, `smart_diff_filter`, `diff_mode`, `max_diff_lines`, `report_style` presets, and `retention_days` expiration settings).
- **`parser.ts`**: Pure zero-dependency JSONC parser supporting single-line `//`, block `/* ... */` comments, and trailing commas.
- **`validator.ts`**: Runtime structural validator (`validateConfig`) providing non-fatal diagnostic warnings for malformed configuration files without throwing unexpected errors.
- **`manager.ts`**: Implements hierarchical configuration loading. Discovers global defaults (`~/.config/ingest/config.jsonc`) and local per-repository configurations (`.ingestrc`, `ingest.config.jsonc`, `.ingest.json`), merges overrides gracefully (including `file_priorities`), validates schema shape, and supports persistent updates.
- **`init.ts`**: Interactive and quick configuration initialization wizard (`ConfigInitWizard`). Guides developers through AI provider selection, branch discovery, prompt presets (Engineering Deep Dive, System-Centric Architecture, Changelog, Security), diff limits, report storage & retention, automatic `.gitignore` prompt and appending for local configurations, and optional scheduler installation.

### 2.2. `src/git/`
- **`runner.ts`**: Safe `git` command execution using `child_process.spawn`. Handles path resolution, detects whether a directory is a valid git repository, lists local/remote branches, infers canonical repository names (via Git remote origin URLs, worktree common directories, or folder paths), queries remote origin (`fetchRemoteOrigin`), verifies refs (`refExists`), supports configurable `maxBuffer` limits (50MB for diffs), resilient error logging, and exports reference comparison utilities (`getCommitsBetweenRefs`, `parseCompareRange`, `resolveBranchTargetRefs`, `resolveSingleRef`).
- **`log.ts`**: Queries Git commit history across specified branches within flexible time windows and custom date ranges (`--date <start>..<end>`, `--since`, `--until`), or between arbitrary Git references/branches/tags (`getCommitsBetweenRefs`, `parseCompareRange`), seamlessly querying `origin/<branch>` and local `<branch>` with deduplication, offline fallback, and resilient error logging.
- **`diff.ts`**: Analyzes repository file stats (`git diff --stat`) and patch excerpts for deep-dive AI context, including ref-to-ref comparisons (`fetchDiffStatBetweenRefs`, `fetchDiffPatchesBetweenRefs`, `fetchDiffBetweenRefs`), resolving target and remote origin refs with stream-safe line bounds. Implements smart diff filtering (`DEFAULT_NOISY_PATTERNS` for lockfiles, bundles, sourcemaps, compiler metadata, media/binary assets, snapshots), user-defined ignore globs (`diff_ignore_patterns`), filter toggle (`smart_diff_filter`), hardened regex matching for quoted filenames, and user-configurable architectural signal prioritization (`file_priorities.high` / `file_priorities.low` in `getFilePriority`) that prioritizes manifests, entrypoints, and core source over secondary artifacts when truncating to line budgets.

### 2.3. `src/ai/`
- **`types.ts`**: Common interfaces for `AIProvider`, `AnalysisContext`, `RepoRollupActivity`, `MultiRepoRollupContext`, `AnalysisResult`, and `TokenUsage`.
- **`discovery.ts`**: Dynamic agent harness registry and real-time PATH probing engine (`HarnessDiscovery`). Automatically detects available CLI tools (`agy`, `claude`, `codex`, `pi`, `opencode`, `gemini`, `ollama`, `aider`, `gh copilot`) with status badges and smart defaults.
- **`tokens.ts`**: Token parsing and formatting utility. Parses exact token metadata from report footers and formats token counts with `N/A` fallback for unrecorded reports.
- **`repair.ts`**: AI-powered Mermaid syntax repair and healing engine. Fixes unquoted node labels, illegal node IDs, broken connector arrows, and converts unformatted architecture blocks into valid `flowchart TD` diagrams.
- **`prompt.ts`**: Generates high-fidelity structured prompts with multi-style layout engines (`buildStandardAnalysisPrompt`, `buildSystemCentricPrompt`) and multi-repo workspace rollup prompt synthesis (`buildMultiRepoRollupPrompt`). Highlights cross-repo architectural interactions, shared contracts, stack-wide risk/deployment notes, and activity matrices.
- **`antigravity.ts`**: Primary provider adapter for Antigravity CLI (`agy --print --output-format json --dangerously-skip-permissions`).
- **`claude.ts`**: Provider adapter for Anthropic Claude Code CLI (`claude -p`).
- **`codex.ts`**: Provider adapter for OpenAI Codex CLI (`codex exec`).
- **`pi.ts`**: Provider adapter for Pi Minimalist Coding Agent (`pi -p`).
- **`opencode.ts`**: Provider adapter for Opencode CLI / local OpenAI-compatible endpoints.
- **`ollama.ts`**: Provider adapter for Ollama local LLM runner (`ollama run`).
- **`aider.ts`**: Provider adapter for Aider pair programming assistant (`aider --message`).
- **`gemini-cli.ts`**: Provider adapter alias for backward compatibility.
- **`custom.ts`**: Provider adapter for custom user-defined commands and executable harnesses.
- **`factory.ts`**: Instantiates and selects the appropriate provider based on active configuration.

### 2.4. `src/report/`
- **`generator.ts`**: Formats structured single-repo and workspace multi-repo rollup markdown reports (`formatReportMarkdown`, `formatWorkspaceRollupMarkdown`, `generateEmptyReport`, `generateEmptyWorkspaceRollup`) with exact token counts and branch/repo context in the metadata footer.
- **`formatter.ts`**: Multi-format report export engine (`formatReport`, `toJson`, `toHtml`, `toSlack`). Transforms markdown summaries into structured JSON objects with metadata, self-contained styled HTML documents, or Slack-compatible mrkdwn snippets.
- **`storage.ts`**: Resolves report file paths (`<output_root>/<repo_name>/YYYY-MM-DD[-<branch>][-<style>]-summary.md` and `<output_root>/_workspace/YYYY-MM-DD-rollup[-<style>]-summary.md`), creates missing directories, saves workspace rollups (`saveWorkspaceRollup`), scans past reports (`listReports`), deletes individual reports (`deleteReport`), parses branch and style filename variants (`parseReportFileName`), groups reports by repository (`groupReportsByRepo`), filters/searches reports across date/branch/style/keywords (`filterReports`), lists repositories (`listRepositories`), and prunes expired reports based on configured retention window (`cleanExpiredReports`).
- **`graph.ts`**: Zero-dependency 2D Unicode & ANSI graph layout engine. Implements topological ranking, character matrix plotting, box-drawing, corner routing, and branch arrow rendering for Mermaid flowcharts directly in terminal character grids.
- **`viewer.ts`**: Zero-dependency terminal markdown renderer with ANSI syntax highlighting, responsive table cell wrapping, and dual-mode diagram formatting (2D box flow vs structured component map).

### 2.5. `src/server/`
- **`server.ts`**: Zero-dependency HTTP server (`node:http`) powering the `--ui` Web Dashboard. Exposes REST endpoints (`/api/status`, `/api/repos`, `/api/reports`, `GET` & `DELETE /api/report`, `POST /api/report/delete`, `POST /api/fix-mermaid`) to browse, inspect, delete reports, and heal Mermaid diagram syntax on demand.
- **`html.ts`**: Embedded responsive Single Page Application (HTML/CSS/JS) with live repo filtering, timeline report selector, zero-dependency Markdown renderer, diff syntax styling, interactive Mermaid diagram viewer with AI repair (`✨ Fix Diagrams`), one-click report deletion (`🗑️ Delete`), token usage badges, copy-to-clipboard, and keyboard navigation (`/`, `c`, `f`, `d`).

### 2.6. `src/scheduler/`
- **`types.ts`**: Types for job configurations, flexible frequency (`daily`, `weekdays`, `weekends`, `custom_days`, `hourly`, `custom`, `weekly`), day-of-week selections (`daysOfWeek`), hourly intervals (`intervalHours`), custom cron expressions (`cronExpression`), expiration (`expiresAt`, `expireDays`), and status (`isExpired`).
- **`helpers.ts`**: Day normalization, cron syntax conversion, cron expression parsing into Launchd calendar components, and human-friendly schedule summary formatting.
- **`cron.ts`**: Manages user crontab entries with managed block markers (`# BEGIN INGEST` / `# END INGEST`), flexible cron expression generation across days/hours/intervals, and optional expiration tracking (`--expire-schedule`).
- **`launchd.ts`**: Generates and manages macOS LaunchAgents (`~/Library/LaunchAgents/com.tsuzuku.ingest.plist`) with `StartCalendarInterval` supporting single dicts, arrays of weekdays/hours, and optional expiration tracking.
- **`status.ts`**: Beautiful ANSI-styled card and box formatter for scheduler status across CLI and interactive TUI, displaying remaining days or expiration badges.

### 2.7. `src/skill/`
- **`installer.ts`**: Discovers and deploys the `ingest` AI skill into `~/.gemini/config/skills/ingest/` (or workspace `.agents/skills/`) so AI coding assistants can immediately assist users.

### 2.8. `src/tui/`
- **`guard.ts`**: Process-level terminal safety guard (`installTerminalGuard`). Listens to `exit`, `uncaughtException`, and `unhandledRejection` to guarantee terminal state restoration, cursor restoration, and raw-mode teardown.
- **`ansi.ts`**: ANSI color codes, text formatting, line drawing, and cursor manipulation.
- **`prompt.ts`**: Zero-dependency interactive prompts: single select with instant real-time typing filter, scroll pagination, navigation, `SIGWINCH` resize handling, multi-select with search and custom items, text input with Tab path autocompletion (`~`, relative `./`, `../`, absolute `/`, directory `/` appending), and confirmation modals with seamless `Esc` back/cancel support.
- **`pager.ts`**: Scrollable terminal pager supporting `Up`/`Down`, `PageUp`/`PageDown`, `Home`/`End`, resize adjustments, and `q`/`Esc` to exit or return.
- **`menu.ts`**: Interactive TUI orchestration loop featuring repository-organized report exploration, report deletion (single report action menu and multi-select batch deletion), report count mapping badges, instant-filter report browsing with date/branch/style/keyword matching directly on typing, and fluid `Esc` back navigation across all menus, submenus, and wizards.

### 2.9. `src/utils/`
- **`date.ts`**: Timezone-safe local date utilities (`getLocalDateString`, `getLocalDaysAgoString`, `getLocalDaysAheadString`) for midnight-anchored local date queries and schedule expirations.
- **`command.ts`**: Child process execution wrapper with execution timeouts, dynamic streaming buffers, and `maxBuffer` management.
- **`concurrency.ts`**: Bounded asynchronous task runner (`pooledMap`) allowing controlled parallel execution across multiple repositories.
- **`logger.ts`**: Multi-level logger (`info`, `warn`, `success`, `error`) writing structured timestamped traces to `error.log`.
