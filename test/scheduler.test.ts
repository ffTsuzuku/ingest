import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CronScheduler } from "../src/scheduler/cron.js";
import { LaunchdScheduler } from "../src/scheduler/launchd.js";

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
    assert.ok(plist.includes("<string>com.tsuzuku.git-ingest</string>"));
    assert.ok(plist.includes("<integer>4</integer>"));
    assert.ok(plist.includes("<integer>15</integer>"));
  });
});
