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

  it("should include reportStyle in filename and allow multiple styles on same date without overwriting", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "ingest-storage-styles-"));
    try {
      // 1. Save standard/default report
      const defaultReport = await ReportStorage.saveReport(
        tempDir,
        {
          repoName: "multi-style-repo",
          repoPath: "/tmp/multi",
          branches: ["main"],
          dateStr: "2026-08-30",
          generatedAt: new Date().toISOString(),
          providerLabel: "antigravity",
          commitCount: 5,
          reportStyle: "default",
        },
        "# Standard Engineering Report",
      );

      // 2. Save system-centric report for the exact same date & repo
      const systemReport = await ReportStorage.saveReport(
        tempDir,
        {
          repoName: "multi-style-repo",
          repoPath: "/tmp/multi",
          branches: ["main"],
          dateStr: "2026-08-30",
          generatedAt: new Date().toISOString(),
          providerLabel: "antigravity",
          commitCount: 5,
          reportStyle: "system-centric",
        },
        "# System-Centric Architecture Report",
      );

      assert.ok(defaultReport.filePath.endsWith("multi-style-repo/2026-08-30-summary.md"));
      assert.ok(systemReport.filePath.endsWith("multi-style-repo/2026-08-30-system-centric-summary.md"));
      assert.notEqual(defaultReport.filePath, systemReport.filePath);

      const list = await ReportStorage.listReports(tempDir);
      assert.equal(list.length, 2);

      const systemItem = list.find((r) => r.reportStyle === "system-centric");
      assert.ok(systemItem);
      assert.equal(systemItem?.dateStr, "2026-08-30");
      assert.equal(systemItem?.fileName, "2026-08-30-system-centric-summary.md");
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

  it("should parse report file names correctly for branch and style variants", () => {
    // 1. Default report without branch
    const p1 = ReportStorage.parseReportFileName("2026-08-31-summary.md");
    assert.equal(p1.dateStr, "2026-08-31");
    assert.equal(p1.branch, undefined);
    assert.equal(p1.reportStyle, undefined);

    // 2. Style-only report without branch
    const p2 = ReportStorage.parseReportFileName("2026-08-31-system-centric-summary.md");
    assert.equal(p2.dateStr, "2026-08-31");
    assert.equal(p2.branch, undefined);
    assert.equal(p2.reportStyle, "system-centric");

    // 3. Branch-specific report with default style
    const p3 = ReportStorage.parseReportFileName("2026-08-31-main-summary.md");
    assert.equal(p3.dateStr, "2026-08-31");
    assert.equal(p3.branch, "main");
    assert.equal(p3.reportStyle, undefined);

    // 4. Branch-specific report with custom style
    const p4 = ReportStorage.parseReportFileName("2026-08-31-develop-system-centric-summary.md");
    assert.equal(p4.dateStr, "2026-08-31");
    assert.equal(p4.branch, "develop");
    assert.equal(p4.reportStyle, "system-centric");

    // 5. Date range with branch and style
    const p5 = ReportStorage.parseReportFileName("2026-08-01-to-2026-08-07-feature-auth-security-summary.md");
    assert.equal(p5.dateStr, "2026-08-01-to-2026-08-07");
    assert.equal(p5.branch, "feature-auth");
    assert.equal(p5.reportStyle, "security");
  });

  it("should generate and save separate reports per branch for multiple branches without overwriting", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "ingest-multi-branch-"));
    try {
      const branches = ["main", "feature/auth-v2"];

      const savedReports = [];
      for (const branch of branches) {
        const saved = await ReportStorage.saveReport(
          tempDir,
          {
            repoName: "multi-branch-repo",
            repoPath: "/tmp/multi-branch-repo",
            branches: [branch],
            branch,
            dateStr: "2026-08-31",
            generatedAt: new Date().toISOString(),
            providerLabel: "antigravity",
            commitCount: branch === "main" ? 3 : 5,
          },
          `# multi-branch-repo (${branch}) - 2026-08-31\n\nBranch specific summary for ${branch}`,
        );
        savedReports.push(saved);
      }

      assert.equal(savedReports.length, 2);
      assert.ok(savedReports[0]?.filePath.endsWith("multi-branch-repo/2026-08-31-main-summary.md"));
      assert.ok(savedReports[1]?.filePath.endsWith("multi-branch-repo/2026-08-31-feature-auth-v2-summary.md"));
      assert.notEqual(savedReports[0]?.filePath, savedReports[1]?.filePath);

      const list = await ReportStorage.listReports(tempDir);
      assert.equal(list.length, 2);

      const mainReport = list.find((r) => r.branch === "main");
      const featReport = list.find((r) => r.branch === "feature-auth-v2" || r.branch === "feature/auth-v2");

      assert.ok(mainReport);
      assert.ok(featReport);
      assert.equal(mainReport?.fileName, "2026-08-31-main-summary.md");
      assert.equal(featReport?.fileName, "2026-08-31-feature-auth-v2-summary.md");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("should group reports by repository correctly", () => {
    const mockReports = [
      {
        filePath: "/reports/repo-a/2026-08-31-summary.md",
        fileName: "2026-08-31-summary.md",
        repoName: "repo-a",
        dateStr: "2026-08-31",
        sizeBytes: 1024,
        modifiedAt: new Date(),
      },
      {
        filePath: "/reports/repo-a/2026-08-30-summary.md",
        fileName: "2026-08-30-summary.md",
        repoName: "repo-a",
        dateStr: "2026-08-30",
        sizeBytes: 1024,
        modifiedAt: new Date(),
      },
      {
        filePath: "/reports/repo-b/2026-08-31-summary.md",
        fileName: "2026-08-31-summary.md",
        repoName: "repo-b",
        dateStr: "2026-08-31",
        sizeBytes: 2048,
        modifiedAt: new Date(),
      },
      {
        filePath: "/reports/_workspace/2026-08-31-rollup-summary.md",
        fileName: "2026-08-31-rollup-summary.md",
        repoName: "_workspace",
        dateStr: "2026-08-31",
        sizeBytes: 4096,
        modifiedAt: new Date(),
      },
    ];

    const grouped = ReportStorage.groupReportsByRepo(mockReports);
    assert.equal(grouped.size, 3);
    assert.equal(grouped.get("repo-a")?.length, 2);
    assert.equal(grouped.get("repo-b")?.length, 1);
    assert.equal(grouped.get("_workspace")?.length, 1);
  });

  it("should filter reports by date, branch, style, and keywords", () => {
    const mockReports = [
      {
        filePath: "/reports/frontend/2026-08-31-main-system-centric-summary.md",
        fileName: "2026-08-31-main-system-centric-summary.md",
        repoName: "frontend",
        dateStr: "2026-08-31",
        branch: "main",
        reportStyle: "system-centric",
        sizeBytes: 1200,
        modifiedAt: new Date(),
      },
      {
        filePath: "/reports/frontend/2026-08-25-feature-auth-changelog-summary.md",
        fileName: "2026-08-25-feature-auth-changelog-summary.md",
        repoName: "frontend",
        dateStr: "2026-08-25",
        branch: "feature-auth",
        reportStyle: "changelog",
        sizeBytes: 1500,
        modifiedAt: new Date(),
      },
      {
        filePath: "/reports/backend/2026-08-31-develop-security-summary.md",
        fileName: "2026-08-31-develop-security-summary.md",
        repoName: "backend",
        dateStr: "2026-08-31",
        branch: "develop",
        reportStyle: "security",
        sizeBytes: 2200,
        modifiedAt: new Date(),
      },
      {
        filePath: "/reports/_workspace/2026-08-31-rollup-summary.md",
        fileName: "2026-08-31-rollup-summary.md",
        repoName: "_workspace",
        dateStr: "2026-08-31",
        branch: "rollup",
        reportStyle: undefined,
        sizeBytes: 3500,
        modifiedAt: new Date(),
      },
    ];

    // 1. Search by date prefix
    const byDate = ReportStorage.filterReports(mockReports, "2026-08-31");
    assert.equal(byDate.length, 3);
    assert.ok(byDate.every((r) => r.dateStr === "2026-08-31"));

    // 2. Search by branch
    const byBranch = ReportStorage.filterReports(mockReports, "feature-auth");
    assert.equal(byBranch.length, 1);
    assert.equal(byBranch[0]?.repoName, "frontend");

    // 3. Search by style
    const byStyle = ReportStorage.filterReports(mockReports, "security");
    assert.equal(byStyle.length, 1);
    assert.equal(byStyle[0]?.repoName, "backend");

    // 4. Search by keyword
    const byKeyword = ReportStorage.filterReports(mockReports, "_workspace");
    assert.equal(byKeyword.length, 1);
    assert.equal(byKeyword[0]?.repoName, "_workspace");

    // 5. Multi-token search (AND condition across tokens)
    const multiToken = ReportStorage.filterReports(mockReports, "frontend system-centric");
    assert.equal(multiToken.length, 1);
    assert.equal(multiToken[0]?.fileName, "2026-08-31-main-system-centric-summary.md");

    // 6. Empty / whitespace search returns all
    const all = ReportStorage.filterReports(mockReports, "   ");
    assert.equal(all.length, mockReports.length);

    // 7. Non-matching query returns empty
    const none = ReportStorage.filterReports(mockReports, "nonexistent-query-12345");
    assert.equal(none.length, 0);
  });
});
