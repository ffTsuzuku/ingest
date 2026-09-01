import type { ScheduleConfig } from "./types.js";

const DAY_NAME_MAP: Record<string, number> = {
  sun: 7,
  sunday: 7,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const DAY_SHORT_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Normalizes day representation into a sorted array of 1-7 (1=Monday, 7=Sunday).
 * Returns undefined if all 7 days or no filter is specified.
 */
export function normalizeDaysOfWeek(input?: number[] | string | number): number[] | undefined {
  if (input === undefined || input === null) return undefined;

  const rawTokens: string[] = [];

  if (Array.isArray(input)) {
    for (const item of input) {
      rawTokens.push(String(item));
    }
  } else if (typeof input === "number") {
    rawTokens.push(String(input));
  } else if (typeof input === "string") {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed || trimmed === "*" || trimmed === "daily" || trimmed === "everyday" || trimmed === "all") {
      return undefined;
    }
    if (trimmed === "weekdays" || trimmed === "mon-fri") {
      return [1, 2, 3, 4, 5];
    }
    if (trimmed === "weekends" || trimmed === "sat-sun") {
      return [6, 7];
    }
    rawTokens.push(...trimmed.split(/[\s,]+/));
  }

  const daysSet = new Set<number>();

  for (const token of rawTokens) {
    const t = token.trim().toLowerCase();
    if (!t) continue;

    if (t.includes("-")) {
      const [startStr, endStr] = t.split("-");
      const startNum = parseDayToken(startStr);
      const endNum = parseDayToken(endStr);
      if (startNum !== undefined && endNum !== undefined) {
        if (startNum <= endNum) {
          for (let i = startNum; i <= endNum; i++) daysSet.add(i);
        } else {
          for (let i = startNum; i <= 7; i++) daysSet.add(i);
          for (let i = 1; i <= endNum; i++) daysSet.add(i);
        }
      }
    } else {
      const num = parseDayToken(t);
      if (num !== undefined) {
        daysSet.add(num);
      }
    }
  }

  if (daysSet.size === 0) return undefined;
  if (daysSet.size === 7) return undefined; // all 7 days

  return Array.from(daysSet).sort((a, b) => a - b);
}

function parseDayToken(token?: string): number | undefined {
  if (!token) return undefined;
  const t = token.trim().toLowerCase();
  if (DAY_NAME_MAP[t] !== undefined) {
    return DAY_NAME_MAP[t];
  }
  const parsed = parseInt(t, 10);
  if (!isNaN(parsed) && parsed >= 0 && parsed <= 7) {
    // 0 and 7 are Sunday -> map to 7
    return parsed === 0 ? 7 : parsed;
  }
  return undefined;
}

/**
 * Converts days of week into cron DOW field syntax (e.g. "1-5", "6,0", "1,3,5", or "*").
 */
export function daysToCronDow(days?: number[] | string | number): string {
  const norm = normalizeDaysOfWeek(days);
  if (!norm || norm.length === 0 || norm.length === 7) return "*";

  // Check common patterns
  const key = norm.join(",");
  if (key === "1,2,3,4,5") return "1-5";
  if (key === "6,7") return "6,0";

  // In standard cron, convert 7 (Sunday) to 0 or 7 (0 is universally supported)
  const cronDays = norm.map((d) => (d === 7 ? 0 : d)).sort((a, b) => a - b);
  return cronDays.join(",");
}

/**
 * Returns a human-friendly string for the specified days (e.g. "Mon-Fri", "Sat-Sun", "Mon, Wed, Fri").
 */
export function formatDaysSummary(days?: number[] | string | number): string {
  const norm = normalizeDaysOfWeek(days);
  if (!norm || norm.length === 0 || norm.length === 7) return "Daily";

  const key = norm.join(",");
  if (key === "1,2,3,4,5") return "Mon-Fri";
  if (key === "6,7") return "Sat-Sun";

  return norm.map((d) => DAY_SHORT_NAMES[d] || String(d)).join(", ");
}

/**
 * Builds a clear human-readable confirmation/summary of a ScheduleConfig.
 */
export function formatScheduleSummary(config: ScheduleConfig): string {
  if (config.cronExpression) {
    return `Custom Cron (${config.cronExpression})`;
  }

  if (config.frequency === "hourly") {
    const [, min = "00"] = (config.time || "00:00").includes(":") ? config.time!.split(":") : ["00", config.time || "00"];
    const minutePad = min.padStart(2, "0");
    const interval = config.intervalHours || 1;
    if (interval > 1) {
      return `Every ${interval} hours at minute :${minutePad}`;
    }
    return `Every hour at minute :${minutePad}`;
  }

  const time = config.time || "00:00";

  if (config.frequency === "weekdays") {
    return `Mon-Fri at ${time}`;
  }

  if (config.frequency === "weekends") {
    return `Sat-Sun at ${time}`;
  }

  if (config.frequency === "custom_days" || config.daysOfWeek !== undefined) {
    const daysStr = formatDaysSummary(config.daysOfWeek);
    return `${daysStr} at ${time}`;
  }

  return `Daily at ${time}`;
}

export interface ParsedCronSchedule {
  minute: number;
  hours: number[] | null; // null means every hour
  daysOfWeek: number[] | null; // null means every day
}

/**
 * Parses a standard 5-part cron expression into launchd-compatible components.
 */
export function parseCronExpression(cronExpr: string): ParsedCronSchedule {
  const parts = cronExpr.trim().split(/\s+/);
  const minPart = parts[0] || "0";
  const hourPart = parts[1] || "*";
  const dowPart = parts[4] || "*";

  let minute = 0;
  if (minPart !== "*") {
    const m = parseInt(minPart, 10);
    if (!isNaN(m)) minute = Math.max(0, Math.min(59, m));
  }

  let hours: number[] | null = null;
  if (hourPart === "*") {
    hours = null;
  } else if (hourPart.startsWith("*/")) {
    const step = parseInt(hourPart.slice(2), 10);
    if (!isNaN(step) && step > 0 && step < 24) {
      hours = [];
      for (let h = 0; h < 24; h += step) {
        hours.push(h);
      }
    }
  } else if (hourPart.includes(",")) {
    hours = hourPart
      .split(",")
      .map((h) => parseInt(h.trim(), 10))
      .filter((h) => !isNaN(h) && h >= 0 && h <= 23);
  } else if (hourPart.includes("-")) {
    const [start, end] = hourPart.split("-").map((h) => parseInt(h.trim(), 10));
    if (start !== undefined && end !== undefined && !isNaN(start) && !isNaN(end) && start <= end) {
      hours = [];
      for (let h = start; h <= end; h++) hours.push(h);
    }
  } else {
    const singleHour = parseInt(hourPart, 10);
    if (!isNaN(singleHour) && singleHour >= 0 && singleHour <= 23) {
      hours = [singleHour];
    }
  }

  let daysOfWeek: number[] | null = null;
  if (dowPart !== "*") {
    const norm = normalizeDaysOfWeek(dowPart);
    if (norm && norm.length > 0 && norm.length < 7) {
      daysOfWeek = norm;
    }
  }

  return { minute, hours, daysOfWeek };
}
