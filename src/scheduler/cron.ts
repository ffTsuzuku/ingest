import { executeCommand } from "../utils/command.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ScheduleConfig, ScheduleStatus } from "./types.js";

const CRON_START_TAG = "# BEGIN INGEST AUTOMATION";
const CRON_END_TAG = "# END INGEST AUTOMATION";

export class CronScheduler {
  public static resolveEntrypoint(): string {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    return resolve(currentDir, "../index.js");
  }

  public static async getCrontab(): Promise<string> {
    try {
      const res = await executeCommand("crontab", ["-l"]);
      if (res.exitCode === 0) {
        return res.stdout;
      }
    } catch {
      // No crontab
    }
    return "";
  }

  public static async setCrontab(content: string): Promise<void> {
    await executeCommand("crontab", ["-"], { input: content });
  }

  public static buildCronExpression(config: ScheduleConfig): string {
    if (config.cronExpression) return config.cronExpression;
    if (config.frequency === "hourly") return "0 * * * *";
    if (config.frequency === "weekly") return "0 0 * * 0";

    // Default daily at HH:MM
    const [hour = "0", min = "0"] = (config.time || "00:00").split(":");
    return `${parseInt(min, 10)} ${parseInt(hour, 10)} * * *`;
  }

  public static async install(config: ScheduleConfig): Promise<void> {
    const existing = await this.getCrontab();
    const cronExpr = this.buildCronExpression(config);

    const workingDir = resolve(process.cwd());
    const entrypoint = this.resolveEntrypoint();
    const configArg = config.configPath ? ` "${config.configPath}"` : "";

    let expiresAt = config.expiresAt;
    if (!expiresAt && typeof config.expireDays === "number" && config.expireDays > 0) {
      const targetDate = new Date(Date.now() + config.expireDays * 86400000);
      expiresAt = targetDate.toISOString().slice(0, 10);
    }
    const expireArg = expiresAt ? ` --expire-schedule "${expiresAt}"` : "";

    const commandLine = `cd "${workingDir}" && "${process.execPath}" "${entrypoint}"${configArg}${expireArg} >> /tmp/ingest-cron.log 2>&1`;

    const managedBlock = `${CRON_START_TAG}\n${cronExpr} ${commandLine}\n${CRON_END_TAG}`;

    let newContent = existing;
    if (newContent.includes(CRON_START_TAG)) {
      const regex = new RegExp(`${CRON_START_TAG}[\\s\\S]*?${CRON_END_TAG}`, "g");
      newContent = newContent.replace(regex, managedBlock);
    } else {
      newContent = newContent.trim() ? `${newContent.trim()}\n\n${managedBlock}\n` : `${managedBlock}\n`;
    }

    await this.setCrontab(newContent);
  }

  public static async uninstall(): Promise<void> {
    const existing = await this.getCrontab();
    if (!existing.includes(CRON_START_TAG)) return;

    const regex = new RegExp(`\\n?${CRON_START_TAG}[\\s\\S]*?${CRON_END_TAG}\\n?`, "g");
    const updated = existing.replace(regex, "").trim();

    if (updated) {
      await this.setCrontab(updated + "\n");
    } else {
      try {
        await executeCommand("crontab", ["-r"]);
      } catch {
        // Ignored
      }
    }
  }

  public static async getStatus(): Promise<ScheduleStatus> {
    const crontab = await this.getCrontab();
    if (crontab.includes(CRON_START_TAG)) {
      const match = crontab.match(new RegExp(`${CRON_START_TAG}\\n([\\s\\S]*?)\\n${CRON_END_TAG}`));
      const line = (match?.[1] || "").trim();
      const parts = line.split(/\s+/);
      const cronExpr = parts.length >= 5 ? parts.slice(0, 5).join(" ") : line;
      const command = parts.length >= 6 ? parts.slice(5).join(" ") : undefined;

      let expiresAt: string | undefined;
      let isExpired = false;
      const expMatch = line.match(/--expire-schedule\s+"?(\d{4}-\d{2}-\d{2})"?/);
      if (expMatch && expMatch[1]) {
        expiresAt = expMatch[1];
        isExpired = new Date(`${expiresAt}T23:59:59.999Z`).getTime() < Date.now();
      }

      return {
        active: true,
        type: "cron",
        details: `Active Cron Job: ${line}`,
        cronExpr,
        command,
        expiresAt,
        isExpired,
        logPath: "/tmp/ingest-cron.log",
      };
    }
    return {
      active: false,
      type: "none",
      details: "No active cron job configured.",
    };
  }
}
