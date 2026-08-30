import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildGitDateArgs } from "../src/git/log.js";
import { isGitRepo, getGitBranches } from "../src/git/runner.js";
import { fetchDiffStat, fetchDiffPatches } from "../src/git/diff.js";

describe("Git Log Helpers", () => {
  it("should format --since for 24h default", () => {
    const args = buildGitDateArgs({ sinceHours: 24 });
    assert.deepEqual(args, ["--since=24 hours ago"]);
  });

  it("should format custom since and until date filters", () => {
    const args = buildGitDateArgs({ since: "2026-04-01 00:00:00", until: "2026-04-01 23:59:59" });
    assert.deepEqual(args, ["--since=2026-04-01 00:00:00", "--until=2026-04-01 23:59:59"]);
  });
});

describe("Git Runner & Diff", () => {
  it("should identify current repo as valid git repo", async () => {
    const valid = await isGitRepo(process.cwd());
    assert.equal(valid, true);
  });

  it("should list branches in current repository", async () => {
    const branches = await getGitBranches(process.cwd());
    assert.ok(Array.isArray(branches));
    assert.ok(branches.length > 0);
  });

  it("should fetch diffstat and patches from repository", async () => {
    const branches = await getGitBranches(process.cwd());
    const stat = await fetchDiffStat(process.cwd(), branches, { since: "2020-01-01" });
    assert.ok(stat !== undefined);
    assert.ok(typeof stat.filesChangedCount === "number");
    assert.ok(Array.isArray(stat.fileStats));
  });
});
