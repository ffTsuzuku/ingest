import { existsSync } from "node:fs";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { executeCommand } from "../utils/command.js";
import type { ScheduleConfig, ScheduleStatus } from "./types.js";

const PLIST_LABEL = "com.tsuzuku.ingest";
const PLIST_PATH = join(homedir(), "Library", "LaunchAgents", `${PLIST_LABEL}.plist`);
const LEGACY_PLIST_LABEL = "com.tsuzuku.git-ingest";
const LEGACY_PLIST_PATH = join(homedir(), "Library", "LaunchAgents", `${LEGACY_PLIST_LABEL}.plist`);

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
    const [hourStr = "0", minStr = "0"] = (config.time || "00:00").split(":");
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minStr, 10);

    const configArg = config.configPath ? `\n    <string>${config.configPath}</string>` : "";
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
    <string>${entrypoint}</string>${configArg}
  </array>
  <key>WorkingDirectory</key>
  <string>${workingDir}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
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

    // Unload legacy if present
    try {
      await executeCommand("launchctl", ["unload", LEGACY_PLIST_PATH]);
      await unlink(LEGACY_PLIST_PATH);
    } catch {
      // Ignored
    }

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

    try {
      await executeCommand("launchctl", ["unload", LEGACY_PLIST_PATH]);
      await unlink(LEGACY_PLIST_PATH);
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
      try {
        const content = await readFile(PLIST_PATH, "utf8");
        const hourMatch = content.match(/<key>Hour<\/key>\s*<integer>(\d+)<\/integer>/);
        const minMatch = content.match(/<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/);
        if (hourMatch && minMatch) {
          scheduleTime = `Daily at ${hourMatch[1].padStart(2, "0")}:${minMatch[1].padStart(2, "0")}`;
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
        isLegacy: false,
        scheduleTime,
        logPath: "/tmp/ingest-launchd.log",
        errorLogPath: "/tmp/ingest-launchd-error.log",
      };
    } catch {
      try {
        await access(LEGACY_PLIST_PATH);
        const res = await executeCommand("launchctl", ["list", LEGACY_PLIST_LABEL]);
        const active = res.exitCode === 0;
        let scheduleTime: string | undefined;
        try {
          const content = await readFile(LEGACY_PLIST_PATH, "utf8");
          const hourMatch = content.match(/<key>Hour<\/key>\s*<integer>(\d+)<\/integer>/);
          const minMatch = content.match(/<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/);
          if (hourMatch && minMatch) {
            scheduleTime = `Daily at ${hourMatch[1].padStart(2, "0")}:${minMatch[1].padStart(2, "0")}`;
          }
        } catch {
          // Ignored
        }

        return {
          active,
          type: "launchd",
          details: active ? `Legacy LaunchAgent loaded (${LEGACY_PLIST_LABEL})` : `Legacy plist file exists at ${LEGACY_PLIST_PATH} but not currently loaded.`,
          label: LEGACY_PLIST_LABEL,
          plistPath: LEGACY_PLIST_PATH,
          isLegacy: true,
          scheduleTime,
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
}
