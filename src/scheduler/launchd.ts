import { existsSync } from "node:fs";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { executeCommand } from "../utils/command.js";
import { getLocalDaysAheadString } from "../utils/date.js";
import type { ScheduleConfig, ScheduleStatus } from "./types.js";
import { formatDaysSummary, normalizeDaysOfWeek, parseCronExpression } from "./helpers.js";

const PLIST_LABEL = "com.tsuzuku.ingest";
const PLIST_PATH = join(homedir(), "Library", "LaunchAgents", `${PLIST_LABEL}.plist`);

export function buildStartCalendarIntervalXml(
  minute: number,
  hours: number[] | null,
  daysOfWeek: number[] | null,
): string {
  // Case 1: Hourly, every hour (hours is null), every day (daysOfWeek is null)
  if (hours === null && (daysOfWeek === null || daysOfWeek.length === 0 || daysOfWeek.length === 7)) {
    return `  <key>StartCalendarInterval</key>
  <dict>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>`;
  }

  // Case 2: Single hour, every day
  if (hours !== null && hours.length === 1 && (daysOfWeek === null || daysOfWeek.length === 0 || daysOfWeek.length === 7)) {
    return `  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hours[0]}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>`;
  }

  // Case 3: Single hour, single weekday
  if (hours !== null && hours.length === 1 && daysOfWeek !== null && daysOfWeek.length === 1) {
    return `  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hours[0]}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
    <key>Weekday</key>
    <integer>${daysOfWeek[0]}</integer>
  </dict>`;
  }

  // Case 4: Multiple items -> array of dicts
  const dicts: string[] = [];
  const targetDays = daysOfWeek && daysOfWeek.length > 0 && daysOfWeek.length < 7 ? daysOfWeek : [null];
  const targetHours = hours && hours.length > 0 ? hours : [null];

  for (const day of targetDays) {
    for (const hour of targetHours) {
      const entries: string[] = [];
      if (hour !== null) {
        entries.push(`      <key>Hour</key>\n      <integer>${hour}</integer>`);
      }
      entries.push(`      <key>Minute</key>\n      <integer>${minute}</integer>`);
      if (day !== null) {
        entries.push(`      <key>Weekday</key>\n      <integer>${day}</integer>`);
      }

      dicts.push(`    <dict>\n${entries.join("\n")}\n    </dict>`);
    }
  }

  return `  <key>StartCalendarInterval</key>\n  <array>\n${dicts.join("\n")}\n  </array>`;
}

export class LaunchdScheduler {
  public static isMacOS(): boolean {
    return process.platform === "darwin";
  }

  public static resolveEntrypoint(): string {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    return resolve(currentDir, "../index.js");
  }

  public static resolveNpxPath(): string {
    const nodeDir = dirname(process.execPath);
    const adjacentNpx = join(nodeDir, "npx");
    if (existsSync(adjacentNpx)) return adjacentNpx;
    if (existsSync("/opt/homebrew/bin/npx")) return "/opt/homebrew/bin/npx";
    if (existsSync("/usr/local/bin/npx")) return "/usr/local/bin/npx";
    return "npx";
  }

  public static generatePlist(config: ScheduleConfig): string {
    const workingDir = resolve(process.cwd());
    const entrypoint = this.resolveEntrypoint();

    let minute = 0;
    let hours: number[] | null = [0];
    let daysOfWeek: number[] | null = null;

    if (config.cronExpression) {
      const parsed = parseCronExpression(config.cronExpression);
      minute = parsed.minute;
      hours = parsed.hours;
      daysOfWeek = parsed.daysOfWeek;
    } else if (config.frequency === "hourly") {
      const [, minStr = "00"] = (config.time || "00:00").includes(":")
        ? config.time!.split(":")
        : ["00", config.time || "00"];
      minute = parseInt(minStr, 10) || 0;
      if (config.intervalHours && config.intervalHours > 1) {
        hours = [];
        for (let h = 0; h < 24; h += config.intervalHours) {
          hours.push(h);
        }
      } else {
        hours = null;
      }
      daysOfWeek = null;
    } else {
      const [hourStr = "0", minStr = "0"] = (config.time || "00:00").split(":");
      const hour = parseInt(hourStr, 10) || 0;
      minute = parseInt(minStr, 10) || 0;
      hours = [hour];

      if (config.frequency === "weekdays") {
        daysOfWeek = [1, 2, 3, 4, 5];
      } else if (config.frequency === "weekends") {
        daysOfWeek = [6, 7];
      } else if (config.frequency === "weekly") {
        daysOfWeek = config.daysOfWeek !== undefined ? normalizeDaysOfWeek(config.daysOfWeek) || [7] : [7];
      } else if (config.frequency === "custom_days" || config.daysOfWeek !== undefined) {
        daysOfWeek = normalizeDaysOfWeek(config.daysOfWeek) || null;
      } else {
        daysOfWeek = null;
      }
    }

    const intervalXml = buildStartCalendarIntervalXml(minute, hours, daysOfWeek);

    const configArg = config.configPath ? `\n    <string>${config.configPath}</string>` : "";

    let expiresAt = config.expiresAt;
    if (!expiresAt && typeof config.expireDays === "number" && config.expireDays > 0) {
      expiresAt = getLocalDaysAheadString(config.expireDays);
    }
    const expireArg = expiresAt ? `\n    <string>--expire-schedule</string>\n    <string>${expiresAt}</string>` : "";

    const nodePath = process.execPath;
    const envPath = process.env.PATH || "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${envPath}</string>
  </dict>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${entrypoint}</string>${configArg}${expireArg}
  </array>
  <key>WorkingDirectory</key>
  <string>${workingDir}</string>
${intervalXml}
  <key>StandardOutPath</key>
  <string>/tmp/ingest-launchd.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/ingest-launchd-error.log</string>
</dict>
</plist>`;
  }

  public static async install(config: ScheduleConfig): Promise<void> {
    if (!this.isMacOS()) {
      throw new Error("Launchd is only available on macOS.");
    }

    const plistContent = this.generatePlist(config);
    await mkdir(dirname(PLIST_PATH), { recursive: true });

    // Unload existing if present
    try {
      await executeCommand("launchctl", ["unload", PLIST_PATH]);
    } catch {
      // Ignored
    }

    await writeFile(PLIST_PATH, plistContent, "utf8");
    await executeCommand("launchctl", ["load", PLIST_PATH]);
  }

  public static async uninstall(): Promise<void> {
    if (!this.isMacOS()) return;

    try {
      await executeCommand("launchctl", ["unload", PLIST_PATH]);
    } catch {
      // Ignored
    }

    try {
      await unlink(PLIST_PATH);
    } catch {
      // Ignored
    }
  }

  public static async getStatus(): Promise<ScheduleStatus> {
    if (!this.isMacOS()) {
      return { active: false, type: "none", details: "Launchd is not supported on this OS." };
    }

    try {
      await access(PLIST_PATH);
      const res = await executeCommand("launchctl", ["list", PLIST_LABEL]);
      const active = res.exitCode === 0;
      let scheduleTime: string | undefined;
      let expiresAt: string | undefined;
      let isExpired = false;

      try {
        const content = await readFile(PLIST_PATH, "utf8");
        const intervalBlockMatch = content.match(
          /<key>StartCalendarInterval<\/key>\s*([\s\S]*?)(?:<key>StandardOutPath|<key>StandardErrorPath|<\/dict>\s*<\/plist>)/,
        );
        if (intervalBlockMatch) {
          const block = intervalBlockMatch[1]!;
          const dictMatches = block.match(/<dict>[\s\S]*?<\/dict>/g) || [];

          if (dictMatches.length === 1) {
            const d = dictMatches[0]!;
            const hourM = d.match(/<key>Hour<\/key>\s*<integer>(\d+)<\/integer>/);
            const minM = d.match(/<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/);
            const weekM = d.match(/<key>Weekday<\/key>\s*<integer>(\d+)<\/integer>/);
            const minStr = minM ? minM[1]!.padStart(2, "0") : "00";

            if (hourM && weekM) {
              const dow = parseInt(weekM[1]!, 10);
              const daysStr = formatDaysSummary([dow]);
              scheduleTime = `${daysStr} at ${hourM[1]!.padStart(2, "0")}:${minStr}`;
            } else if (hourM) {
              scheduleTime = `Daily at ${hourM[1]!.padStart(2, "0")}:${minStr}`;
            } else if (minM) {
              scheduleTime = `Hourly at minute :${minStr}`;
            }
          } else if (dictMatches.length > 1) {
            const weekdays: number[] = [];
            const hours: number[] = [];
            let minuteStr = "00";

            for (const d of dictMatches) {
              const hourM = d.match(/<key>Hour<\/key>\s*<integer>(\d+)<\/integer>/);
              const minM = d.match(/<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/);
              const weekM = d.match(/<key>Weekday<\/key>\s*<integer>(\d+)<\/integer>/);
              if (minM) minuteStr = minM[1]!.padStart(2, "0");
              if (hourM) {
                const h = parseInt(hourM[1]!, 10);
                if (!hours.includes(h)) hours.push(h);
              }
              if (weekM) {
                const w = parseInt(weekM[1]!, 10);
                if (!weekdays.includes(w)) weekdays.push(w);
              }
            }

            if (weekdays.length > 0 && (hours.length === 1 || hours.length === 0)) {
              const daysStr = formatDaysSummary(weekdays);
              const hourStr = hours.length === 1 ? String(hours[0]).padStart(2, "0") : "00";
              scheduleTime = `${daysStr} at ${hourStr}:${minuteStr}`;
            } else if (hours.length > 1 && weekdays.length === 0) {
              const diff = hours.length > 1 ? hours[1]! - hours[0]! : 0;
              const isRegular = diff > 0 && hours.every((h, idx) => idx === 0 || h - hours[idx - 1]! === diff);
              if (isRegular && diff > 1) {
                scheduleTime = `Every ${diff} hours at minute :${minuteStr}`;
              } else {
                scheduleTime = `At ${hours.map((h) => `${String(h).padStart(2, "0")}:${minuteStr}`).join(", ")}`;
              }
            } else if (weekdays.length > 0) {
              const daysStr = formatDaysSummary(weekdays);
              scheduleTime = `${daysStr} (multiple intervals)`;
            }
          }
        }
        const expMatch = content.match(/<string>--expire-schedule<\/string>\s*<string>(\d{4}-\d{2}-\d{2})<\/string>/);
        if (expMatch && expMatch[1]) {
          expiresAt = expMatch[1];
          isExpired = new Date(`${expiresAt}T23:59:59.999Z`).getTime() < Date.now();
        }
      } catch {
        // Ignored
      }

      return {
        active,
        type: "launchd",
        details: active ? `LaunchAgent loaded (${PLIST_LABEL})` : `Plist file exists at ${PLIST_PATH} but not currently loaded.`,
        label: PLIST_LABEL,
        plistPath: PLIST_PATH,
        scheduleTime,
        expiresAt,
        isExpired,
        logPath: "/tmp/ingest-launchd.log",
        errorLogPath: "/tmp/ingest-launchd-error.log",
      };
    } catch {
      return {
        active: false,
        type: "none",
        details: "No active LaunchAgent plist found.",
      };
    }
  }
}
