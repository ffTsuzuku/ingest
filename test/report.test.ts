import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { formatReportMarkdown, generateEmptyReport } from "../src/report/generator.js";
import { ReportStorage } from "../src/report/storage.js";

describe("Report Generator", () => {
  it("should generate empty report structure when zero commits", () => {
    const res = generateEmptyReport({
      repoName: "demo-repo",
      repoPath: "/tmp/demo",
      branches: ["main"],
      dateStr: "2026-04-05",
      commits: [],
      basePrompt: "",
    });

    assert.ok(res.markdown.includes("# demo-repo - 2026-04-05"));
    assert.ok(res.markdown.includes("No commit activity recorded"));
    assert.equal(res.meta.commitCount, 0);
  });

  it("should format markdown with title and metadata footer", () => {
    const res = formatReportMarkdown(
      {
        repoName: "demo-repo",
        repoPath: "/tmp/demo",
        branches: ["main"],
        dateStr: "2026-04-05",
        commits: [
          {
            hash: "123456",
            author: "Bob",
            email: "bob@example.com",
            timestamp: "2026-04-05T12:00:00Z",
            subject: "fix: resolve memory leak",
            body: "",
            branch: "main",
            filesChanged: [],
          },
        ],
        basePrompt: "",
      },
      {
        content: "## Commit Summary\n- Bob fixed memory leak",
        providerLabel: "opencode:qwen-max",
      },
    );

    assert.ok(res.markdown.startsWith("# demo-repo - 2026-04-05"));
    assert.ok(res.markdown.includes("Generated on"));
    assert.ok(res.markdown.includes("opencode:qwen-max"));
  });
});

describe("Report Storage & Expiration", () => {
  it("should save and list reports", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "ingest-storage-"));
    try {
      const saved = await ReportStorage.saveReport(
        tempDir,
        {
          repoName: "test-repo",
          repoPath: "/tmp/test-repo",
          branches: ["main"],
          dateStr: "2026-08-01",
          generatedAt: new Date().toISOString(),
          providerLabel: "antigravity",
          commitCount: 2,
        },
        "# Report Content",
      );

      assert.ok(saved.filePath.endsWith("test-repo/2026-08-01-summary.md"));
      const list = await ReportStorage.listReports(tempDir);
      assert.equal(list.length, 1);
      assert.equal(list[0]?.repoName, "test-repo");
      assert.equal(list[0]?.dateStr, "2026-08-01");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("should prune expired reports older than retentionDays", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "ingest-expiration-"));
    try {
      const repoDir = join(tempDir, "my-repo");
      await mkdir(repoDir, { recursive: true });

      // Create an expired single-date report (45 days old relative to reference time)
      const oldReportPath = join(repoDir, "2026-06-01-summary.md");
      await writeFile(oldReportPath, "# Old Report", "utf8");

      // Create an expired range report (ended 40 days ago)
      const oldRangePath = join(repoDir, "2026-06-01-to-2026-06-10-summary.md");
      await writeFile(oldRangePath, "# Old Range Report", "utf8");

      // Create a fresh single-date report (5 days old relative to reference time)
      const freshReportPath = join(repoDir, "2026-07-25-summary.md");
      await writeFile(freshReportPath, "# Fresh Report", "utf8");

      // Reference current time: 2026-07-30
      const referenceNow = new Date("2026-07-30T12:00:00Z");

      // Run cleanup with 30-day retention
      const deleted = await ReportStorage.cleanExpiredReports(tempDir, 30, referenceNow);

      assert.equal(deleted.length, 2);
      assert.ok(deleted.includes(oldReportPath));
      assert.ok(deleted.includes(oldRangePath));
      assert.ok(!deleted.includes(freshReportPath));

      const remaining = await ReportStorage.listReports(tempDir);
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0]?.fileName, "2026-07-25-summary.md");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("should not delete anything when retentionDays is 0 (disabled)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "ingest-expiration-"));
    try {
      const repoDir = join(tempDir, "my-repo");
      await mkdir(repoDir, { recursive: true });

      const oldReportPath = join(repoDir, "2020-01-01-summary.md");
      await writeFile(oldReportPath, "# Very Old Report", "utf8");

      const deleted = await ReportStorage.cleanExpiredReports(tempDir, 0, new Date("2026-07-30T12:00:00Z"));
      assert.equal(deleted.length, 0);

      const remaining = await ReportStorage.listReports(tempDir);
      assert.equal(remaining.length, 1);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
