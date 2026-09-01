import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CronScheduler } from "../src/scheduler/cron.js";
import { LaunchdScheduler } from "../src/scheduler/launchd.js";
import { formatScheduleLines } from "../src/scheduler/status.js";
import {
  formatDaysSummary,
  formatScheduleSummary,
  normalizeDaysOfWeek,
  parseCronExpression,
} from "../src/scheduler/helpers.js";

describe("Cron Scheduler", () => {
  it("should build standard cron expression for daily time", () => {
    const expr = CronScheduler.buildCronExpression({ frequency: "daily", time: "02:30" });
    assert.equal(expr, "30 2 * * *");
  });

  it("should support hourly frequency without interval", () => {
    const expr = CronScheduler.buildCronExpression({ frequency: "hourly" });
    assert.equal(expr, "0 * * * *");
  });

  it("should support hourly frequency with custom interval and minute", () => {
    const expr = CronScheduler.buildCronExpression({
      frequency: "hourly",
      intervalHours: 3,
      time: "00:15",
    });
    assert.equal(expr, "15 */3 * * *");
  });

  it("should support weekdays frequency (Monday to Friday)", () => {
    const expr = CronScheduler.buildCronExpression({
      frequency: "weekdays",
      time: "18:00",
    });
    assert.equal(expr, "0 18 * * 1-5");
  });

  it("should support weekends frequency (Saturday & Sunday)", () => {
    const expr = CronScheduler.buildCronExpression({
      frequency: "weekends",
      time: "10:30",
    });
    assert.equal(expr, "30 10 * * 6,0");
  });

  it("should support custom days of week as numbers array", () => {
    const expr = CronScheduler.buildCronExpression({
      frequency: "custom_days",
      time: "09:00",
      daysOfWeek: [1, 3, 5],
    });
    assert.equal(expr, "0 9 * * 1,3,5");
  });

  it("should support custom days of week as named string", () => {
    const expr = CronScheduler.buildCronExpression({
      frequency: "custom_days",
      time: "08:45",
      daysOfWeek: "Mon, Wed, Fri",
    });
    assert.equal(expr, "45 8 * * 1,3,5");
  });

  it("should pass through raw custom cronExpression directly", () => {
    const expr = CronScheduler.buildCronExpression({
      frequency: "custom",
      cronExpression: "15 4 * * 1-5",
    });
    assert.equal(expr, "15 4 * * 1-5");
  });
});

describe("Launchd Scheduler", () => {
  it("should generate valid launchd plist XML with hour and minute for daily schedule", () => {
    const plist = LaunchdScheduler.generatePlist({ frequency: "daily", time: "04:15" });
    assert.ok(plist.includes("<string>com.tsuzuku.ingest</string>"));
    assert.ok(plist.includes("<key>Hour</key>\n    <integer>4</integer>"));
    assert.ok(plist.includes("<key>Minute</key>\n    <integer>15</integer>"));
  });

  it("should generate array of dicts for weekdays schedule", () => {
    const plist = LaunchdScheduler.generatePlist({
      frequency: "weekdays",
      time: "18:00",
    });
    assert.ok(plist.includes("<key>StartCalendarInterval</key>\n  <array>"));
    assert.ok(plist.includes("<key>Weekday</key>\n      <integer>1</integer>"));
    assert.ok(plist.includes("<key>Weekday</key>\n      <integer>2</integer>"));
    assert.ok(plist.includes("<key>Weekday</key>\n      <integer>3</integer>"));
    assert.ok(plist.includes("<key>Weekday</key>\n      <integer>4</integer>"));
    assert.ok(plist.includes("<key>Weekday</key>\n      <integer>5</integer>"));
    assert.ok(plist.includes("<key>Hour</key>\n      <integer>18</integer>"));
  });

  it("should generate array of dicts for weekends schedule", () => {
    const plist = LaunchdScheduler.generatePlist({
      frequency: "weekends",
      time: "10:00",
    });
    assert.ok(plist.includes("<key>StartCalendarInterval</key>\n  <array>"));
    assert.ok(plist.includes("<key>Weekday</key>\n      <integer>6</integer>"));
    assert.ok(plist.includes("<key>Weekday</key>\n      <integer>7</integer>"));
    assert.ok(plist.includes("<key>Hour</key>\n      <integer>10</integer>"));
  });

  it("should generate array of dicts for custom days of week", () => {
    const plist = LaunchdScheduler.generatePlist({
      frequency: "custom_days",
      time: "09:30",
      daysOfWeek: [1, 3, 5],
    });
    assert.ok(plist.includes("<key>StartCalendarInterval</key>\n  <array>"));
    assert.ok(plist.includes("<key>Weekday</key>\n      <integer>1</integer>"));
    assert.ok(plist.includes("<key>Weekday</key>\n      <integer>3</integer>"));
    assert.ok(plist.includes("<key>Weekday</key>\n      <integer>5</integer>"));
    assert.ok(plist.includes("<key>Hour</key>\n      <integer>9</integer>"));
    assert.ok(plist.includes("<key>Minute</key>\n      <integer>30</integer>"));
  });

  it("should generate single dict with Minute only for hourly schedule", () => {
    const plist = LaunchdScheduler.generatePlist({
      frequency: "hourly",
      time: "00:20",
    });
    assert.ok(plist.includes("<key>StartCalendarInterval</key>\n  <dict>"));
    assert.ok(plist.includes("<key>Minute</key>\n    <integer>20</integer>"));
    assert.ok(!plist.includes("<key>Hour</key>"));
  });

  it("should generate array of periodic hours for hourly interval > 1", () => {
    const plist = LaunchdScheduler.generatePlist({
      frequency: "hourly",
      intervalHours: 4,
      time: "00:00",
    });
    assert.ok(plist.includes("<key>StartCalendarInterval</key>\n  <array>"));
    assert.ok(plist.includes("<key>Hour</key>\n      <integer>0</integer>"));
    assert.ok(plist.includes("<key>Hour</key>\n      <integer>4</integer>"));
    assert.ok(plist.includes("<key>Hour</key>\n      <integer>8</integer>"));
    assert.ok(plist.includes("<key>Hour</key>\n      <integer>12</integer>"));
    assert.ok(plist.includes("<key>Hour</key>\n      <integer>16</integer>"));
    assert.ok(plist.includes("<key>Hour</key>\n      <integer>20</integer>"));
  });

  it("should parse custom cronExpression into Launchd StartCalendarInterval", () => {
    const plist = LaunchdScheduler.generatePlist({
      frequency: "custom",
      cronExpression: "30 9 * * 1-5",
    });
    assert.ok(plist.includes("<key>StartCalendarInterval</key>\n  <array>"));
    assert.ok(plist.includes("<key>Hour</key>\n      <integer>9</integer>"));
    assert.ok(plist.includes("<key>Minute</key>\n      <integer>30</integer>"));
    assert.ok(plist.includes("<key>Weekday</key>\n      <integer>1</integer>"));
    assert.ok(plist.includes("<key>Weekday</key>\n      <integer>5</integer>"));
  });

  it("should include --expire-schedule in launchd plist when expiresAt is specified", () => {
    const plist = LaunchdScheduler.generatePlist({
      frequency: "daily",
      time: "00:00",
      expiresAt: "2026-09-30",
    });
    assert.ok(plist.includes("<string>--expire-schedule</string>"));
    assert.ok(plist.includes("<string>2026-09-30</string>"));
  });
});

describe("Scheduler Helpers & Summaries", () => {
  it("should normalize days of week from strings and numbers", () => {
    assert.deepEqual(normalizeDaysOfWeek("weekdays"), [1, 2, 3, 4, 5]);
    assert.deepEqual(normalizeDaysOfWeek("weekends"), [6, 7]);
    assert.deepEqual(normalizeDaysOfWeek("Mon, Wed, Fri"), [1, 3, 5]);
    assert.deepEqual(normalizeDaysOfWeek("1-5"), [1, 2, 3, 4, 5]);
    assert.deepEqual(normalizeDaysOfWeek([0, 6]), [6, 7]);
    assert.equal(normalizeDaysOfWeek("*"), undefined);
    assert.equal(normalizeDaysOfWeek("daily"), undefined);
  });

  it("should format days summary cleanly", () => {
    assert.equal(formatDaysSummary([1, 2, 3, 4, 5]), "Mon-Fri");
    assert.equal(formatDaysSummary([6, 7]), "Sat-Sun");
    assert.equal(formatDaysSummary([1, 3, 5]), "Mon, Wed, Fri");
    assert.equal(formatDaysSummary("Mon, Wed, Fri"), "Mon, Wed, Fri");
    assert.equal(formatDaysSummary("*"), "Daily");
  });

  it("should format complete schedule confirmation summary", () => {
    assert.equal(
      formatScheduleSummary({ frequency: "daily", time: "00:00" }),
      "Daily at 00:00",
    );
    assert.equal(
      formatScheduleSummary({ frequency: "weekdays", time: "18:00" }),
      "Mon-Fri at 18:00",
    );
    assert.equal(
      formatScheduleSummary({ frequency: "weekends", time: "10:00" }),
      "Sat-Sun at 10:00",
    );
    assert.equal(
      formatScheduleSummary({ frequency: "custom_days", time: "09:30", daysOfWeek: [1, 3, 5] }),
      "Mon, Wed, Fri at 09:30",
    );
    assert.equal(
      formatScheduleSummary({ frequency: "hourly", intervalHours: 1, time: "00:15" }),
      "Every hour at minute :15",
    );
    assert.equal(
      formatScheduleSummary({ frequency: "hourly", intervalHours: 3, time: "00:00" }),
      "Every 3 hours at minute :00",
    );
    assert.equal(
      formatScheduleSummary({ frequency: "custom", cronExpression: "0 0 * * *" }),
      "Custom Cron (0 0 * * *)",
    );
  });

  it("should parse cron expressions into schedule structure", () => {
    const p1 = parseCronExpression("30 9 * * 1-5");
    assert.equal(p1.minute, 30);
    assert.deepEqual(p1.hours, [9]);
    assert.deepEqual(p1.daysOfWeek, [1, 2, 3, 4, 5]);

    const p2 = parseCronExpression("0 */3 * * *");
    assert.equal(p2.minute, 0);
    assert.deepEqual(p2.hours, [0, 3, 6, 9, 12, 15, 18, 21]);
    assert.equal(p2.daysOfWeek, null);

    const p3 = parseCronExpression("15 * * * *");
    assert.equal(p3.minute, 15);
    assert.equal(p3.hours, null);
  });
});

describe("Scheduler Status Formatting", () => {
  it("should format active and inactive scheduler lines cleanly", () => {
    const lines = formatScheduleLines(
      {
        active: true,
        type: "launchd",
        details: "Loaded",
        label: "com.tsuzuku.ingest",
        scheduleTime: "Daily at 00:00",
        expiresAt: "2026-09-30",
        isExpired: false,
        plistPath: "/Users/test/Library/LaunchAgents/com.tsuzuku.ingest.plist",
        logPath: "/tmp/ingest-launchd.log",
      },
      {
        active: false,
        type: "none",
        details: "No active cron job configured.",
      },
    );

    const fullText = lines.join("\n");
    assert.ok(fullText.includes("macOS LaunchAgent"));
    assert.ok(fullText.includes("ACTIVE"));
    assert.ok(fullText.includes("Daily at 00:00"));
    assert.ok(fullText.includes("Expires:"));
    assert.ok(fullText.includes("2026-09-30"));
    assert.ok(fullText.includes("Crontab"));
    assert.ok(fullText.includes("INACTIVE"));
  });

  it("should display expired badge when schedule has passed expiration date", () => {
    const lines = formatScheduleLines(
      null,
      {
        active: true,
        type: "cron",
        details: "Active",
        cronExpr: "0 0 * * *",
        expiresAt: "2026-01-01",
        isExpired: true,
        logPath: "/tmp/ingest-cron.log",
      },
    );

    const fullText = lines.join("\n");
    assert.ok(fullText.includes("EXPIRED"));
    assert.ok(fullText.includes("2026-01-01"));
  });
});
