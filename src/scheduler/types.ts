export type ScheduleFrequency = "daily" | "hourly" | "weekly" | "custom";

export interface ScheduleConfig {
  frequency: ScheduleFrequency;
  time?: string; // HH:MM, e.g. "00:00"
  cronExpression?: string; // e.g. "0 0 * * *"
  configPath?: string;
  outputRoot?: string;
  expiresAt?: string; // YYYY-MM-DD expiration date
  expireDays?: number; // Expiration duration in days from install
}

export interface ScheduleStatus {
  active: boolean;
  type: "launchd" | "cron" | "none";
  details: string;
  nextRun?: string;
  label?: string;
  plistPath?: string;
  scheduleTime?: string;
  cronExpr?: string;
  command?: string;
  expiresAt?: string;
  isExpired?: boolean;
  logPath?: string;
  errorLogPath?: string;
}
