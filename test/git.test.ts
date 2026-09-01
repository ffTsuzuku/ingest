import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildGitDateArgs, resolveDateFilter, fetchBranchCommits, fetchRepoCommits } from "../src/git/log.js";
import {
  isGitRepo,
  getGitBranches,
  getAllGitBranches,
  getRepoName,
  extractRepoNameFromUrl,
  refExists,
  fetchRemoteOrigin,
  resolveBranchTargetRefs,
  resolveSingleRef,
} from "../src/git/runner.js";
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

  it("should resolve single date filter", () => {
    const resolved = resolveDateFilter({ dateStr: "2026-08-15" });
    assert.equal(resolved.reportDateStr, "2026-08-15");
    assert.deepEqual(resolved.dateFilter, {
      since: "2026-08-15 00:00:00",
      until: "2026-08-15 23:59:59",
    });
  });

  it("should resolve date range filter with double dots", () => {
    const resolved = resolveDateFilter({ dateStr: "2026-08-01..2026-08-07" });
    assert.equal(resolved.reportDateStr, "2026-08-01-to-2026-08-07");
    assert.deepEqual(resolved.dateFilter, {
      since: "2026-08-01 00:00:00",
      until: "2026-08-07 23:59:59",
    });
  });

  it("should resolve date range filter with 'to' separator and auto-sort inverted dates", () => {
    const resolved = resolveDateFilter({ dateStr: "2026-08-07 to 2026-08-01" });
    assert.equal(resolved.reportDateStr, "2026-08-01-to-2026-08-07");
    assert.deepEqual(resolved.dateFilter, {
      since: "2026-08-01 00:00:00",
      until: "2026-08-07 23:59:59",
    });
  });

  it("should resolve explicit sinceStr and untilStr", () => {
    const resolved = resolveDateFilter({ sinceStr: "2026-08-01", untilStr: "2026-08-10" });
    assert.equal(resolved.reportDateStr, "2026-08-01-to-2026-08-10");
    assert.deepEqual(resolved.dateFilter, {
      since: "2026-08-01 00:00:00",
      until: "2026-08-10 23:59:59",
    });
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

  it("should list all git branches including sorted main/active branches", async () => {
    const allBranches = await getAllGitBranches(process.cwd());
    assert.ok(Array.isArray(allBranches));
    assert.ok(allBranches.length > 0);
  });

  it("should fetch diffstat and patches from repository", async () => {
    const branches = await getGitBranches(process.cwd());
    const stat = await fetchDiffStat(process.cwd(), branches, { since: "2020-01-01" });
    assert.ok(stat !== undefined);
    assert.ok(typeof stat.filesChangedCount === "number");
    assert.ok(Array.isArray(stat.fileStats));
  });

  it("should extract repo name from various Git remote URL formats", () => {
    assert.equal(extractRepoNameFromUrl("git@github.com:ffTsuzuku/github-ingest.git"), "github-ingest");
    assert.equal(extractRepoNameFromUrl("https://github.com/ffTsuzuku/github-ingest.git"), "github-ingest");
    assert.equal(extractRepoNameFromUrl("https://github.com/org/custom-repo"), "custom-repo");
    assert.equal(extractRepoNameFromUrl("git@gitlab.com:group/subgroup/project.git"), "project");
    assert.equal(extractRepoNameFromUrl("ssh://git@bitbucket.org/owner/my-app.git"), "my-app");
    assert.equal(extractRepoNameFromUrl("file:///local/path/to/my-repo.git"), "my-repo");
  });

  it("should detect repo name accurately for current repository", async () => {
    const repoName = await getRepoName(process.cwd());
    // For this repo, origin remote is github-ingest
    assert.equal(repoName, "github-ingest");
  });

  it("should respect explicit configured repo name over git remote inference", async () => {
    const repoName = await getRepoName(process.cwd(), "custom-override-name");
    assert.equal(repoName, "custom-override-name");
  });

  it("should check if git ref exists correctly", async () => {
    const exists = await refExists("HEAD", process.cwd());
    assert.equal(exists, true);

    const nonExistent = await refExists("non-existent-ref-12345", process.cwd());
    assert.equal(nonExistent, false);
  });

  it("should attempt fetchRemoteOrigin and return boolean without throwing", async () => {
    const res = await fetchRemoteOrigin(process.cwd(), 3000);
    assert.equal(typeof res, "boolean");

    // Also verify non-git folder or fake path returns false gracefully without throwing
    const nonGitRes = await fetchRemoteOrigin("/non/existent/path", 1000);
    assert.equal(nonGitRes, false);
  });

  it("should resolve branch target refs including origin if present", async () => {
    const targetRefs = await resolveBranchTargetRefs(process.cwd(), "main");
    assert.ok(Array.isArray(targetRefs));
    assert.ok(targetRefs.length > 0);
    assert.ok(targetRefs.includes("main") || targetRefs.includes("origin/main"));
  });

  it("should resolve single ref falling back gracefully", async () => {
    const headRef = await resolveSingleRef(process.cwd(), "HEAD");
    assert.equal(headRef, "HEAD");

    const nonExistent = await resolveSingleRef(process.cwd(), "totally-unknown-ref-xyz");
    assert.equal(nonExistent, "totally-unknown-ref-xyz");
  });

  it("should fetch branch commits using resolved refs without error", async () => {
    const commits = await fetchBranchCommits(process.cwd(), "main", { sinceHours: 24 * 365 });
    assert.ok(Array.isArray(commits));
    if (commits.length > 0) {
      assert.ok(commits[0]!.hash);
      assert.ok(commits[0]!.author);
      assert.equal(commits[0]!.branch, "main");
    }
  });
});
