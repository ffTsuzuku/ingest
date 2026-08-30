export type ScheduleFrequency = "daily" | "hourly" | "weekly" | "custom";

export interface ScheduleConfig {
  frequency: ScheduleFrequency;
  time?: string; // HH:MM, e.g. "00:00"
  cronExpression?: string; // e.g. "0 0 * * *"
  configPath?: string;
  outputRoot?: string;
}

export interface ScheduleStatus {
  active: boolean;
  type: "launchd" | "cron" | "none";
  details: string;
  nextRun?: string;
  label?: string;
  plistPath?: string;
  isLegacy?: boolean;
  scheduleTime?: string;
  cronExpr?: string;
  command?: string;
  logPath?: string;
  errorLogPath?: string;
}
