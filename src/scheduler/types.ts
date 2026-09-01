export type ScheduleFrequency =
  | "daily"
  | "weekdays"
  | "weekends"
  | "custom_days"
  | "hourly"
  | "custom"
  | "weekly";

export interface ScheduleConfig {
  frequency: ScheduleFrequency;
  time?: string; // HH:MM, e.g. "00:00"
  daysOfWeek?: number[] | string; // Days of week: e.g. [1, 2, 3, 4, 5], "1-5", "1,3,5", or "Mon,Wed,Fri"
  intervalHours?: number; // Hourly interval in hours, e.g. 1, 2, 3...
  cronExpression?: string; // e.g. "0 0 * * *" or "30 9 * * 1-5"
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
