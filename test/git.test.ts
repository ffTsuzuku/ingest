import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildGitDateArgs } from "../src/git/log.js";
import { isGitRepo, getGitBranches, getRepoName, extractRepoNameFromUrl } from "../src/git/runner.js";
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
});
