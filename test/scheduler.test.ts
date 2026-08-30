import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CronScheduler } from "../src/scheduler/cron.js";
import { LaunchdScheduler } from "../src/scheduler/launchd.js";

import { formatScheduleLines } from "../src/scheduler/status.js";

describe("Cron Scheduler", () => {
  it("should build standard cron expression for daily time", () => {
    const expr = CronScheduler.buildCronExpression({ frequency: "daily", time: "02:30" });
    assert.equal(expr, "30 2 * * *");
  });

  it("should support hourly frequency", () => {
    const expr = CronScheduler.buildCronExpression({ frequency: "hourly" });
    assert.equal(expr, "0 * * * *");
  });
});

describe("Launchd Scheduler", () => {
  it("should generate valid launchd plist XML with hour and minute", () => {
    const plist = LaunchdScheduler.generatePlist({ frequency: "daily", time: "04:15" });
    assert.ok(plist.includes("<string>com.tsuzuku.ingest</string>"));
    assert.ok(plist.includes("<integer>4</integer>"));
    assert.ok(plist.includes("<integer>15</integer>"));
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
        plistPath: "/Users/test/Library/LaunchAgents/com.tsuzuku.ingest.plist",
        logPath: "/tmp/ingest-launchd.log",
        isLegacy: false,
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
    assert.ok(fullText.includes("Crontab"));
    assert.ok(fullText.includes("INACTIVE"));
  });
});
