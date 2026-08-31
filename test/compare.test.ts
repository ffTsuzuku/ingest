import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCompareRange, getCommitsBetweenRefs } from "../src/git/log.js";
import { fetchDiffStatBetweenRefs, fetchDiffPatchesBetweenRefs, fetchDiffBetweenRefs } from "../src/git/diff.js";
import { runGit } from "../src/git/runner.js";
import { formatReportMarkdown, generateEmptyReport } from "../src/report/generator.js";

describe("Git Revision & Branch Comparison", () => {
  describe("parseCompareRange", () => {
    it("should parse two-dot range syntax (base..target)", () => {
      const parsed = parseCompareRange("main..feature");
      assert.equal(parsed.baseRef, "main");
      assert.equal(parsed.targetRef, "feature");
      assert.equal(parsed.range, "main..feature");
      assert.equal(parsed.operator, "..");
    });

    it("should parse three-dot symmetric difference range syntax (base...target)", () => {
      const parsed = parseCompareRange("origin/main...HEAD");
      assert.equal(parsed.baseRef, "origin/main");
      assert.equal(parsed.targetRef, "HEAD");
      assert.equal(parsed.range, "origin/main...HEAD");
      assert.equal(parsed.operator, "...");
    });

    it("should parse tag range comparison", () => {
      const parsed = parseCompareRange("v1.0.0..v2.0.0");
      assert.equal(parsed.baseRef, "v1.0.0");
      assert.equal(parsed.targetRef, "v2.0.0");
      assert.equal(parsed.range, "v1.0.0..v2.0.0");
      assert.equal(parsed.operator, "..");
    });

    it("should default targetRef to HEAD when single ref provided", () => {
      const parsed = parseCompareRange("staging");
      assert.equal(parsed.baseRef, "staging");
      assert.equal(parsed.targetRef, "HEAD");
      assert.equal(parsed.range, "staging..HEAD");
      assert.equal(parsed.operator, "..");
    });
  });

  describe("Git Operations with Temporary Repository", () => {
    let tempDir: string;

    before(async () => {
      tempDir = await mkdtemp(join(tmpdir(), "ingest-compare-test-"));
      // Initialize git repo
      await runGit(["init", "-b", "main"], tempDir);
      await runGit(["config", "user.name", "Test Ingest Agent"], tempDir);
      await runGit(["config", "user.email", "agent@test.local"], tempDir);

      // Create initial commit on main
      await writeFile(join(tempDir, "base.txt"), "Hello Base\nLine 2\n", "utf8");
      await runGit(["add", "."], tempDir);
      await runGit(["commit", "-m", "Initial commit on main"], tempDir);
      await runGit(["tag", "v1.0.0"], tempDir);

      // Create feature branch
      await runGit(["checkout", "-b", "feature/awesome"], tempDir);
      await writeFile(join(tempDir, "feature.txt"), "Feature content\nNew feature line\n", "utf8");
      await writeFile(join(tempDir, "base.txt"), "Hello Base\nLine 2 modified\nLine 3 added\n", "utf8");
      await runGit(["add", "."], tempDir);
      await runGit(["commit", "-m", "feat: add awesome feature and update base"], tempDir);

      // Create second commit on feature branch
      await writeFile(join(tempDir, "feature2.txt"), "Another feature file\n", "utf8");
      await runGit(["add", "."], tempDir);
      await runGit(["commit", "-m", "fix: minor tweak in feature"], tempDir);
    });

    after(async () => {
      if (tempDir) {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    it("should extract commit history between base and target branch", async () => {
      const commits = await getCommitsBetweenRefs(tempDir, "main", "feature/awesome");
      assert.equal(commits.length, 2);
      assert.equal(commits[0]?.subject, "fix: minor tweak in feature");
      assert.equal(commits[1]?.subject, "feat: add awesome feature and update base");
      assert.equal(commits[0]?.author, "Test Ingest Agent");
      assert.equal(commits[0]?.email, "agent@test.local");
      assert.ok(commits[1]?.filesChanged.includes("feature.txt"));
      assert.ok(commits[1]?.filesChanged.includes("base.txt"));
    });

    it("should accept combined range string as first argument in getCommitsBetweenRefs", async () => {
      const commits = await getCommitsBetweenRefs(tempDir, "main..feature/awesome");
      assert.equal(commits.length, 2);
      assert.equal(commits[0]?.subject, "fix: minor tweak in feature");
    });

    it("should compare between tag and branch", async () => {
      const commits = await getCommitsBetweenRefs(tempDir, "v1.0.0..feature/awesome");
      assert.equal(commits.length, 2);
    });

    it("should return empty array when comparing identical refs", async () => {
      const commits = await getCommitsBetweenRefs(tempDir, "main", "main");
      assert.deepEqual(commits, []);
    });

    it("should return empty array gracefully for nonexistent refs", async () => {
      const commits = await getCommitsBetweenRefs(tempDir, "nonexistent-branch..main");
      assert.deepEqual(commits, []);
    });

    it("should extract diff stats between branches", async () => {
      const stat = await fetchDiffStatBetweenRefs(tempDir, "main", "feature/awesome");
      assert.ok(stat !== undefined);
      assert.ok(stat.filesChangedCount >= 2);
      assert.ok(stat.insertions > 0);
      assert.ok(stat.fileStats.length >= 2);

      const baseStat = stat.fileStats.find((f) => f.path === "base.txt");
      assert.ok(baseStat !== undefined);
      assert.ok(baseStat.insertions > 0);

      const featureStat = stat.fileStats.find((f) => f.path === "feature.txt");
      assert.ok(featureStat !== undefined);
      assert.ok(featureStat.insertions > 0);
    });

    it("should extract unified diff patches between branches", async () => {
      const patches = await fetchDiffPatchesBetweenRefs(tempDir, "main..feature/awesome");
      assert.ok(patches.includes("diff --git a/feature.txt b/feature.txt"));
      assert.ok(patches.includes("+Feature content"));
    });

    it("should return clean 0-stat DiffStat for identical refs", async () => {
      const stat = await fetchDiffBetweenRefs(tempDir, "main..main");
      assert.ok(stat !== undefined);
      assert.equal(stat.filesChangedCount, 0);
      assert.equal(stat.insertions, 0);
      assert.equal(stat.deletions, 0);
      assert.deepEqual(stat.fileStats, []);
    });

    it("should format report markdown with comparison title and metadata", () => {
      const context = {
        repoName: "test-repo",
        repoPath: tempDir,
        branches: ["main..feature/awesome"],
        branch: "main..feature/awesome",
        dateStr: "compare-main-feature-awesome",
        commits: [
          {
            hash: "abc1234567890",
            author: "Test Author",
            email: "test@example.com",
            timestamp: "2026-08-31T12:00:00Z",
            subject: "feat: comparison test",
            body: "Detailed change description",
            branch: "main..feature/awesome",
            filesChanged: ["feature.txt"],
          },
        ],
        basePrompt: "Prompt",
      };

      const result = {
        content: "## Executive Summary\nComparison summary content.",
        providerLabel: "mock:test",
      };

      const { markdown, meta } = formatReportMarkdown(context, result);
      assert.ok(markdown.includes("# test-repo - compare-main-feature-awesome"));
      assert.ok(markdown.includes("branch: main..feature/awesome"));
      assert.equal(meta.branch, "main..feature/awesome");
      assert.equal(meta.commitCount, 1);
    });

    it("should generate empty report for comparison when zero commits", () => {
      const context = {
        repoName: "test-repo",
        repoPath: tempDir,
        branches: ["main..main"],
        branch: "main..main",
        dateStr: "compare-main-main",
        commits: [],
        basePrompt: "Prompt",
      };

      const { markdown, meta } = generateEmptyReport(context);
      assert.ok(markdown.includes("# test-repo - compare-main-main"));
      assert.ok(markdown.includes("No commit activity recorded"));
      assert.equal(meta.commitCount, 0);
    });
  });
});
