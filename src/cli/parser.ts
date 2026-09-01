import { ANSI } from "../tui/ansi.js";
import type { ScheduleFrequency } from "../scheduler/types.js";

export interface ParsedArgs {
  format?: string;
  rollup?: boolean;
  configPath?: string;
  outputRoot?: string;
  retentionDays?: number;
  cleanExpired?: boolean;
  repoPath?: string;
  compare?: string;
  dateStr?: string;
  sinceStr?: string;
  untilStr?: string;
  dateRange?: string;
  sinceHours?: number;
  diffMode?: boolean;
  reportStyle?: string;
  viewFile?: string;
  fixDiagramFile?: string;
  ui?: boolean;
  port?: number;
  noOpen?: boolean;
  init?: boolean;
  quickInit?: boolean;
  localInit?: boolean;
  globalInit?: boolean;
  installSkill?: boolean;
  scheduleInstall?: boolean;
  scheduleStatus?: boolean;
  scheduleRemove?: boolean;
  scheduleTime?: string;
  scheduleCron?: string;
  scheduleDays?: string;
  scheduleFrequency?: ScheduleFrequency;
  intervalHours?: number;
  expiresAt?: string;
  expireDays?: number;
  expireSchedule?: string;
  interactive?: boolean;
  help?: boolean;
}

export function parseCliArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";

    if (arg === "-h" || arg === "--help") {
      result.help = true;
    } else if (arg === "--rollup" || arg === "rollup") {
      result.rollup = true;
    } else if (arg === "-i" || arg === "--interactive") {
      result.interactive = true;
    } else if (arg === "--init" || arg === "init") {
      result.init = true;
    } else if (arg === "--quick" || arg === "--quick-init" || arg === "-q") {
      result.quickInit = true;
    } else if (arg === "--local") {
      result.localInit = true;
    } else if (arg === "--global") {
      result.globalInit = true;
    } else if (
      arg === "clean" ||
      arg === "cleanup" ||
      arg === "prune" ||
      arg === "--clean" ||
      arg === "--cleanup" ||
      arg === "--clean-expired" ||
      arg === "--clean-reports" ||
      arg === "--prune"
    ) {
      result.cleanExpired = true;
    } else if ((arg === "--retention-days" || arg === "--days" || arg === "-d") && i + 1 < args.length) {
      result.retentionDays = parseInt(args[++i] ?? "30", 10);
    } else if (arg === "--expire-schedule" && i + 1 < args.length) {
      result.expireSchedule = args[++i];
    } else if ((arg === "--expires" || arg === "--expire-at") && i + 1 < args.length) {
      result.expiresAt = args[++i];
    } else if (arg === "--expire-days" && i + 1 < args.length) {
      result.expireDays = parseInt(args[++i] ?? "0", 10);
    } else if (arg === "--config" && i + 1 < args.length) {
      result.configPath = args[++i];
    } else if (arg === "--output-root" && i + 1 < args.length) {
      result.outputRoot = args[++i];
    } else if ((arg === "--compare" || arg === "-c") && i + 1 < args.length) {
      result.compare = args[++i];
    } else if (arg === "--repo" && i + 1 < args.length) {
      result.repoPath = args[++i];
    } else if (arg === "--date" && i + 1 < args.length) {
      result.dateStr = args[++i];
    } else if (arg === "--since" && i + 1 < args.length) {
      result.sinceStr = args[++i];
    } else if (arg === "--until" && i + 1 < args.length) {
      result.untilStr = args[++i];
    } else if ((arg === "--range" || arg === "--date-range") && i + 1 < args.length) {
      result.dateRange = args[++i];
    } else if (arg === "--diff") {
      result.diffMode = true;
    } else if ((arg === "--style" || arg === "--report-style") && i + 1 < args.length) {
      result.reportStyle = args[++i];
    } else if ((arg === "--format" || arg === "--output-format" || arg === "-f") && i + 1 < args.length) {
      result.format = args[++i];
    } else if (arg === "--ui" || arg === "ui" || arg === "--serve" || arg === "serve") {
      result.ui = true;
    } else if (arg === "--port" && i + 1 < args.length) {
      result.port = parseInt(args[++i] ?? "3456", 10);
    } else if (arg === "--no-open") {
      result.noOpen = true;
    } else if (arg === "--view" && i + 1 < args.length) {
      result.viewFile = args[++i];
    } else if ((arg === "--fix-diagram" || arg === "--fix-diagrams" || arg === "--repair" || arg === "repair") && i + 1 < args.length) {
      result.fixDiagramFile = args[++i];
    } else if (arg === "--install-skill") {
      result.installSkill = true;
    } else if (arg === "--schedule-install") {
      result.scheduleInstall = true;
    } else if (arg === "--schedule-status") {
      result.scheduleStatus = true;
    } else if (arg === "--schedule-remove") {
      result.scheduleRemove = true;
    } else if (arg === "--schedule-cron" || (arg === "--cron" && i + 1 < args.length)) {
      result.scheduleCron = args[++i];
    } else if (arg === "--schedule-days" || (arg === "--schedule-day" && i + 1 < args.length)) {
      result.scheduleDays = args[++i];
    } else if (arg === "--schedule-frequency" || (arg === "--frequency" && i + 1 < args.length)) {
      result.scheduleFrequency = args[++i] as ScheduleFrequency;
    } else if (arg === "--interval-hours" && i + 1 < args.length) {
      result.intervalHours = parseInt(args[++i] ?? "1", 10);
    } else if (arg === "--time" && i + 1 < args.length) {
      result.scheduleTime = args[++i];
    } else if (!arg.startsWith("-") && !result.configPath) {
      result.configPath = arg;
    }
  }

  return result;
}

export function printHelp(): void {
  console.log(`
${ANSI.bold}${ANSI.brightCyan}ingest${ANSI.reset} - AI Daily Report Generator & Git Activity Explorer

${ANSI.bold}USAGE:${ANSI.reset}
  ingest                              Launch interactive TUI
  ingest --ui [--port <N>]            Launch web browser report dashboard
  ingest --init                       Interactive configuration setup wizard
  ingest --init --quick               Quick setup with intelligent defaults (.ingestrc)
  ingest --rollup                     Generate multi-repo workspace rollup summary
  ingest clean [--days <N>]           Clean up / prune expired reports (default 30 days)
  ingest [config-path]                Run headless generation for all repos in config
  ingest --repo <path>                Run report for a single repository
  ingest --date <YYYY-MM-DD>          Generate report for a specific date
  ingest --date <start>..<end>        Generate report for a date range (e.g. 2026-08-01..2026-08-07)
  ingest --since <date> --until <date> Generate report for a custom date range
  ingest --compare <base>..<target>   Compare Git refs/branches/tags (e.g. main..feature)
  ingest --diff                       Enable Git diff deep-dive analysis
  ingest --clean                      Prune expired reports past retention period
  ingest --view <report.md>           View markdown report in terminal pager
  ingest --fix-diagrams <report.md>   Inspect and repair Mermaid diagram syntax with AI
  ingest --install-skill              Deploy AI skill to ~/.gemini/config/skills/ingest/
  ingest --schedule-install           Install automated scheduler (launchd / cron)
  ingest --schedule-install --frequency weekdays --time 18:00
  ingest --schedule-install --days 1,3,5 --time 09:30
  ingest --schedule-install --frequency hourly --interval-hours 3
  ingest --schedule-install --cron "30 9 * * 1-5"
  ingest --schedule-install --expires <YYYY-MM-DD>  Install scheduler with automatic expiration date
  ingest --schedule-status            Check current scheduler status
  ingest --schedule-remove            Remove automated schedules

${ANSI.bold}OPTIONS:${ANSI.reset}
  --ui, ui, --serve           Launch web browser report explorer dashboard
  --port <N>                  Port for web server (default: 3456)
  --no-open                   Do not automatically open the web browser
  --init                      Launch interactive configuration wizard
  -q, --quick                 Use recommended defaults for fast initialization
  --local                     Target local repo configuration (.ingestrc)
  --global                    Target global configuration (~/.config/ingest/config.jsonc)
  -i, --interactive           Force interactive TUI mode
  --clean, clean              Prune expired reports older than retention period
  --rollup                    Synthesize cross-repository executive rollup report
  -d, --days <N>              Override expiration retention window in days (default: 30)
  --config <path>             Path to custom config.jsonc
  --output-root <path>        Override report output directory
  --retention-days <days>     Report expiration retention period in days (default: 30, 0 = keep forever)
  --expires <YYYY-MM-DD>      Set expiration date for automated scheduler
  --expire-days <days>        Set expiration duration in days for automated scheduler
  --date <date|range>         Specific date (YYYY-MM-DD) or range (YYYY-MM-DD..YYYY-MM-DD)
  --since <date>              Start date for commit history
  --until <date>              End date for commit history
  --range <start..end>        Date range alias
  -c, --compare <base..target> Compare commits and diffs between two Git references
  --style <style>             Report format preset ("system-centric" | "default" | "changelog" | "security")
  -f, --format <fmt>          Output format: "markdown" (default) | "json" | "html" | "slack"
  --time <HH:MM>              Scheduled run time (default: 00:00)
  --frequency <freq>          Schedule frequency ("daily" | "weekdays" | "weekends" | "custom_days" | "hourly" | "custom")
  --days <1-5|1,3,5|names>    Target days of week for schedule
  --interval-hours <N>        Periodic hour interval for hourly schedules
  --cron <expr>               Custom 5-field cron expression for schedule
  -h, --help                  Show this help message
`);
}
