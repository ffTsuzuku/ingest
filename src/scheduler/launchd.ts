import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { executeCommand } from "../utils/command.js";
import type { ScheduleConfig, ScheduleStatus } from "./types.js";

const PLIST_LABEL = "com.tsuzuku.git-ingest";
const PLIST_PATH = join(homedir(), "Library", "LaunchAgents", `${PLIST_LABEL}.plist`);

export class LaunchdScheduler {
  public static isMacOS(): boolean {
    return process.platform === "darwin";
  }

  public static generatePlist(config: ScheduleConfig): string {
    const projectRoot = resolve(process.cwd());
    const [hourStr = "0", minStr = "0"] = (config.time || "00:00").split(":");
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minStr, 10);

    const configArg = config.configPath ? `\n    <string>${config.configPath}</string>` : "";

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/npx</string>
    <string>ts-node</string>
    <string>${join(projectRoot, "src/index.ts")}</string>${configArg}
  </array>
  <key>WorkingDirectory</key>
  <string>${projectRoot}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/tmp/git-ingest-launchd.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/git-ingest-launchd-error.log</string>
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
      return { active: false, type: "none", details: "launchd not supported on this OS" };
    }

    try {
      await access(PLIST_PATH);
      const res = await executeCommand("launchctl", ["list", PLIST_LABEL]);
      const active = res.exitCode === 0;
      return {
        active,
        type: "launchd",
        details: active ? `LaunchAgent loaded (${PLIST_LABEL}) at ${PLIST_PATH}` : `Plist file exists at ${PLIST_PATH} but not currently loaded.`,
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
