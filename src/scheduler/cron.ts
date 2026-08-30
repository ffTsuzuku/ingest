import { executeCommand } from "../utils/command.js";
import { resolve } from "node:path";
import type { ScheduleConfig, ScheduleStatus } from "./types.js";

const CRON_START_TAG = "# BEGIN GIT-INGEST AUTOMATION";
const CRON_END_TAG = "# END GIT-INGEST AUTOMATION";

export class CronScheduler {
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

    const projectRoot = resolve(process.cwd());
    const configArg = config.configPath ? ` ${config.configPath}` : "";
    const commandLine = `cd "${projectRoot}" && npx ts-node src/index.ts${configArg} >> /tmp/git-ingest-cron.log 2>&1`;

    const managedBlock = `${CRON_START_TAG}\n${cronExpr} ${commandLine}\n${CRON_END_TAG}`;

    let newContent = "";
    if (existing.includes(CRON_START_TAG)) {
      const regex = new RegExp(`${CRON_START_TAG}[\\s\\S]*?${CRON_END_TAG}`, "g");
      newContent = existing.replace(regex, managedBlock);
    } else {
      newContent = existing.trim() ? `${existing.trim()}\n\n${managedBlock}\n` : `${managedBlock}\n`;
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
      const line = match?.[1] || "";
      return {
        active: true,
        type: "cron",
        details: `Active Cron Job: ${line}`,
      };
    }
    return {
      active: false,
      type: "none",
      details: "No active cron job found for git-ingest.",
    };
  }
}
