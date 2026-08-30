import { homedir } from "node:os";
import { ANSI, drawBox } from "../tui/ansi.js";
import { LaunchdScheduler } from "./launchd.js";
import { CronScheduler } from "./cron.js";
import type { ScheduleStatus } from "./types.js";

function shortenPath(p?: string): string {
  if (!p) return "";
  const home = homedir();
  return p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

export function formatScheduleLines(launchdStatus: ScheduleStatus | null, cronStatus: ScheduleStatus): string[] {
  const lines: string[] = [];
  const isMac = LaunchdScheduler.isMacOS();

  if (isMac && launchdStatus) {
    const badge = launchdStatus.active
      ? `${ANSI.green}${ANSI.bold}● ACTIVE${ANSI.reset}`
      : `${ANSI.gray}○ INACTIVE${ANSI.reset}`;
    lines.push(`${ANSI.bold}${ANSI.brightCyan}macOS LaunchAgent${ANSI.reset}  ${badge}`);

    if (launchdStatus.active) {
      const legacyTag = launchdStatus.isLegacy ? ` ${ANSI.yellow}(Legacy)${ANSI.reset}` : "";
      if (launchdStatus.label) {
        lines.push(`  ${ANSI.dim}Label:${ANSI.reset}     ${ANSI.cyan}${launchdStatus.label}${ANSI.reset}${legacyTag}`);
      }
      if (launchdStatus.scheduleTime) {
        lines.push(`  ${ANSI.dim}Schedule:${ANSI.reset}  ${ANSI.brightGreen}${launchdStatus.scheduleTime}${ANSI.reset}`);
      }
      if (launchdStatus.plistPath) {
        lines.push(`  ${ANSI.dim}Plist:${ANSI.reset}     ${ANSI.gray}${shortenPath(launchdStatus.plistPath)}${ANSI.reset}`);
      }
      if (launchdStatus.logPath) {
        lines.push(`  ${ANSI.dim}Logs:${ANSI.reset}      ${ANSI.gray}${launchdStatus.logPath}${ANSI.reset}`);
      }
    } else {
      lines.push(`  ${ANSI.dim}Details:${ANSI.reset}   ${ANSI.gray}${launchdStatus.details}${ANSI.reset}`);
    }
    lines.push("");
  }

  const cronBadge = cronStatus.active
    ? `${ANSI.green}${ANSI.bold}● ACTIVE${ANSI.reset}`
    : `${ANSI.gray}○ INACTIVE${ANSI.reset}`;
  lines.push(`${ANSI.bold}${ANSI.brightCyan}Crontab${ANSI.reset}            ${cronBadge}`);

  if (cronStatus.active) {
    const legacyTag = cronStatus.isLegacy ? ` ${ANSI.yellow}(Legacy)${ANSI.reset}` : "";
    if (cronStatus.cronExpr) {
      lines.push(`  ${ANSI.dim}Schedule:${ANSI.reset}  ${ANSI.brightGreen}${cronStatus.cronExpr}${ANSI.reset}${legacyTag}`);
    }
    if (cronStatus.command) {
      lines.push(`  ${ANSI.dim}Command:${ANSI.reset}   ${ANSI.gray}${shortenPath(cronStatus.command)}${ANSI.reset}`);
    }
    if (cronStatus.logPath) {
      lines.push(`  ${ANSI.dim}Logs:${ANSI.reset}      ${ANSI.gray}${cronStatus.logPath}${ANSI.reset}`);
    }
  } else {
    lines.push(`  ${ANSI.dim}Details:${ANSI.reset}   ${ANSI.gray}${cronStatus.details}${ANSI.reset}`);
  }

  return lines;
}

export async function renderScheduleStatusBox(): Promise<string> {
  const isMac = LaunchdScheduler.isMacOS();
  const launchdStatus = isMac ? await LaunchdScheduler.getStatus() : null;
  const cronStatus = await CronScheduler.getStatus();

  const lines = formatScheduleLines(launchdStatus, cronStatus);
  const termWidth = process.stdout.columns || 80;
  const boxWidth = Math.max(50, Math.min(76, termWidth - 2));

  return drawBox("Automation & Scheduler Status", lines, boxWidth).join("\n");
}
