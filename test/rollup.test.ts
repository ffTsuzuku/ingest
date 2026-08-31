import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMultiRepoRollupPrompt } from "../src/ai/prompt.js";
import { formatWorkspaceRollupMarkdown, generateEmptyWorkspaceRollup } from "../src/report/generator.js";
import { ReportStorage } from "../src/report/storage.js";
import type { MultiRepoRollupContext, AnalysisResult } from "../src/ai/types.js";

describe("Multi-Repo Workspace Rollup Prompt Builder", () => {
  it("should format multi-repo prompt with activities across multiple repos and diff stats", () => {
    const context: MultiRepoRollupContext = {
      workspaceName: "Core Platform Stack",
      dateStr: "2026-08-31",
      repos: [
        {
          repoName: "backend-api",
          repoPath: "/workspace/backend-api",
          branches: ["main", "feature/v2"],
          commits: [
            {
              hash: "abc111222333",
              author: "Alice Lead",
              email: "alice@example.com",
              timestamp: "2026-08-31T10:00:00Z",
              subject: "feat: add user billing protobuf definitions",
              body: "Defined gRPC schema for subscription tiers",
              branch: "main",
              filesChanged: ["proto/billing.proto", "src/billing/service.go"],
            },
          ],
          diffStat: {
            filesChangedCount: 2,
            insertions: 150,
            deletions: 20,
            fileStats: [{ path: "proto/billing.proto", insertions: 100, deletions: 5 }],
            diffSummary: "proto/billing.proto | 105 +++++-",
            diffPatches: "@@ -1,5 +1,15 @@\n+service BillingService {}",
          },
        },
        {
          repoName: "frontend-web",
          repoPath: "/workspace/frontend-web",
          branches: ["main"],
          commits: [
            {
              hash: "def444555666",
              author: "Bob Frontend",
              email: "bob@example.com",
              timestamp: "2026-08-31T12:30:00Z",
              subject: "feat: integrate billing checkout modal",
              body: "Updated UI to consume new billing gRPC client",
              branch: "main",
              filesChanged: ["src/components/Checkout.tsx"],
            },
          ],
          diffStat: {
            filesChangedCount: 1,
            insertions: 80,
            deletions: 10,
            fileStats: [{ path: "src/components/Checkout.tsx", insertions: 80, deletions: 10 }],
            diffSummary: "src/components/Checkout.tsx | 90 ++++++++-",
            diffPatches: "@@ -1,5 +1,10 @@\n+export const CheckoutModal = () => {}",
          },
        },
      ],
      basePrompt: "Default workspace prompt",
    };

    const prompt = buildMultiRepoRollupPrompt(context);

    // Workspace overview checks
    assert.ok(prompt.includes("Core Platform Stack"));
    assert.ok(prompt.includes("2026-08-31"));
    assert.ok(prompt.includes("Total Repositories Analyzed: 2"));
    assert.ok(prompt.includes("Total Commits across all Repositories: 2"));
    assert.ok(prompt.includes("+230 / -30"));
    assert.ok(prompt.includes("across 3 files"));

    // Repositories checks
    assert.ok(prompt.includes("backend-api"));
    assert.ok(prompt.includes("Alice Lead"));
    assert.ok(prompt.includes("feat: add user billing protobuf definitions"));
    assert.ok(prompt.includes("+service BillingService {}"));

    assert.ok(prompt.includes("frontend-web"));
    assert.ok(prompt.includes("Bob Frontend"));
    assert.ok(prompt.includes("feat: integrate billing checkout modal"));
    assert.ok(prompt.includes("+export const CheckoutModal"));

    // Template section checks
    assert.ok(prompt.includes("# Workspace Engineering Rollup — 2026-08-31"));
    assert.ok(prompt.includes("## Executive Summary"));
    assert.ok(prompt.includes("## Cross-Repository & Architectural Interactions"));
    assert.ok(prompt.includes("## Repository Highlights & Implementation Mechanics"));
    assert.ok(prompt.includes("## Stack-Wide Risk, Breaking Changes & Deployment Considerations"));
    assert.ok(prompt.includes("## Cross-Repository Activity Matrix"));
    assert.ok(prompt.includes("## Workspace Contributors"));
  });

  it("should format empty multi-repo prompt gracefully when no commits", () => {
    const context: MultiRepoRollupContext = {
      workspaceName: "Idle Stack",
      dateStr: "2026-08-31",
      repos: [
        {
          repoName: "service-a",
          repoPath: "/workspace/service-a",
          branches: ["main"],
          commits: [],
        },
      ],
      basePrompt: "Default workspace prompt",
    };

    const prompt = buildMultiRepoRollupPrompt(context);

    assert.ok(prompt.includes("Idle Stack"));
    assert.ok(prompt.includes("Total Commits across all Repositories: 0"));
    assert.ok(prompt.includes("(No commits in this time window)"));
  });

  it("should prioritize customPrompt over basePrompt in multi-repo rollup prompt", () => {
    const context: MultiRepoRollupContext = {
      dateStr: "2026-08-31",
      repos: [],
      basePrompt: "Default base prompt",
      customPrompt: "Custom workspace rollup directive: focus on shared gRPC contracts",
    };

    const prompt = buildMultiRepoRollupPrompt(context);
    assert.ok(prompt.includes("Custom workspace rollup directive: focus on shared gRPC contracts"));
  });
});

describe("Multi-Repo Workspace Rollup Report Generator", () => {
  it("should format workspace rollup markdown with multi-repo metadata footer and total commits count", () => {
    const context: MultiRepoRollupContext = {
      workspaceName: "My Workspace",
      dateStr: "2026-08-31",
      repos: [
        {
          repoName: "repo-1",
          repoPath: "/path/repo-1",
          branches: ["main"],
          commits: [
            {
              hash: "11111111",
              author: "Dev One",
              email: "one@example.com",
              timestamp: "2026-08-31T08:00:00Z",
              subject: "feat: update core lib",
              body: "",
              branch: "main",
              filesChanged: ["index.ts"],
            },
          ],
        },
        {
          repoName: "repo-2",
          repoPath: "/path/repo-2",
          branches: ["dev"],
          commits: [
            {
              hash: "22222222",
              author: "Dev Two",
              email: "two@example.com",
              timestamp: "2026-08-31T09:00:00Z",
              subject: "feat: consume core lib v2",
              body: "",
              branch: "dev",
              filesChanged: ["app.ts"],
            },
          ],
        },
      ],
      basePrompt: "Base prompt",
    };

    const aiResult: AnalysisResult = {
      content: "## Executive Summary\nMulti-service upgrades deployed across backend and frontend.",
      providerLabel: "agy:gemini-2.5-pro",
      tokenUsage: { promptTokens: 1200, completionTokens: 400, totalTokens: 1600 },
    };

    const { markdown, meta } = formatWorkspaceRollupMarkdown(context, aiResult);

    assert.equal(meta.repoName, "_workspace");
    assert.equal(meta.branch, "rollup");
    assert.equal(meta.commitCount, 2);
    assert.deepEqual(meta.branches.sort(), ["dev", "main"]);
    assert.equal(meta.providerLabel, "agy:gemini-2.5-pro");
    assert.equal(meta.tokenUsage?.totalTokens, 1600);

    assert.ok(markdown.startsWith("# Workspace Engineering Rollup — 2026-08-31"));
    assert.ok(markdown.includes("## Executive Summary"));
    assert.ok(markdown.includes("Multi-service upgrades deployed across backend and frontend."));
    assert.ok(markdown.includes("2 commits analyzed across 2 repositories"));
    assert.ok(markdown.includes("1,600 tokens"));
  });

  it("should generate empty workspace rollup report when 0 commits", () => {
    const context: MultiRepoRollupContext = {
      dateStr: "2026-08-31",
      repos: [
        { repoName: "repo-1", repoPath: "/p1", branches: ["main"], commits: [] },
        { repoName: "repo-2", repoPath: "/p2", branches: ["main"], commits: [] },
      ],
      basePrompt: "Base prompt",
    };

    const { markdown, meta } = generateEmptyWorkspaceRollup(context);

    assert.equal(meta.repoName, "_workspace");
    assert.equal(meta.branch, "rollup");
    assert.equal(meta.commitCount, 0);
    assert.equal(meta.providerLabel, "ingest:none");

    assert.ok(markdown.includes("# Workspace Engineering Rollup — 2026-08-31"));
    assert.ok(markdown.includes("No commit activity recorded across configured repositories"));
    assert.ok(markdown.includes("0 commits analyzed across 2 repositories"));
  });
});

describe("Multi-Repo Workspace Rollup Storage & Expiration", () => {
  it("should get workspace rollup file path with and without style", () => {
    const pathDefault = ReportStorage.getWorkspaceRollupFilePath("/tmp/reports", "2026-08-31");
    assert.equal(pathDefault, join("/tmp/reports", "_workspace", "2026-08-31-rollup-summary.md"));

    const pathStyle = ReportStorage.getWorkspaceRollupFilePath("/tmp/reports", "2026-08-31", "system-centric");
    assert.equal(pathStyle, join("/tmp/reports", "_workspace", "2026-08-31-rollup-system-centric-summary.md"));
  });

  it("should parse rollup report file names correctly for branch and style variants", () => {
    const parsedDefault = ReportStorage.parseReportFileName("2026-08-31-rollup-summary.md");
    assert.equal(parsedDefault.dateStr, "2026-08-31");
    assert.equal(parsedDefault.branch, "rollup");

    const parsedStyled = ReportStorage.parseReportFileName("2026-08-31-rollup-system-centric-summary.md");
    assert.equal(parsedStyled.dateStr, "2026-08-31");
    assert.equal(parsedStyled.branch, "rollup");
    assert.equal(parsedStyled.reportStyle, "system-centric");
  });

  it("should save and list workspace rollup reports in _workspace directory", async () => {
    const testDir = await mkdtemp(join(tmpdir(), "ingest-rollup-storage-"));

    try {
      const meta = {
        repoName: "_workspace",
        repoPath: "/workspace",
        branches: ["main", "dev"],
        branch: "rollup",
        dateStr: "2026-08-31",
        generatedAt: "2026-08-31T18:00:00.000Z",
        providerLabel: "agy:mock",
        commitCount: 5,
      };

      const markdown = "# Workspace Engineering Rollup — 2026-08-31\n\n## Executive Summary\nAll systems nominal.\n\n---\n*Generated on 2026-08-31T18:00:00.000Z via `agy:mock` (5 commits analyzed across 3 repositories)*";

      const saved = await ReportStorage.saveWorkspaceRollup(testDir, meta, markdown);
      assert.equal(saved.filePath, join(testDir, "_workspace", "2026-08-31-rollup-summary.md"));

      const reports = await ReportStorage.listReports(testDir);
      assert.equal(reports.length, 1);
      assert.equal(reports[0]?.repoName, "_workspace");
      assert.equal(reports[0]?.branch, "rollup");
      assert.equal(reports[0]?.dateStr, "2026-08-31");

      const repos = await ReportStorage.listRepositories(testDir);
      assert.equal(repos.length, 1);
      assert.equal(repos[0]?.repoName, "_workspace");
      assert.equal(repos[0]?.reportCount, 1);
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("should prune expired workspace rollup reports older than retentionDays", async () => {
    const testDir = await mkdtemp(join(tmpdir(), "ingest-rollup-clean-"));

    try {
      const oldDate = "2026-01-01";
      const recentDate = "2026-08-30";

      const oldMeta = {
        repoName: "_workspace",
        repoPath: "/workspace",
        branches: ["main"],
        branch: "rollup",
        dateStr: oldDate,
        generatedAt: "2026-01-01T00:00:00.000Z",
        providerLabel: "agy:mock",
        commitCount: 2,
      };

      const recentMeta = {
        repoName: "_workspace",
        repoPath: "/workspace",
        branches: ["main"],
        branch: "rollup",
        dateStr: recentDate,
        generatedAt: "2026-08-30T00:00:00.000Z",
        providerLabel: "agy:mock",
        commitCount: 3,
      };

      await ReportStorage.saveWorkspaceRollup(testDir, oldMeta, "# Old Rollup");
      await ReportStorage.saveWorkspaceRollup(testDir, recentMeta, "# Recent Rollup");

      const now = new Date("2026-08-31T12:00:00.000Z");
      const deleted = await ReportStorage.cleanExpiredReports(testDir, 30, now);

      assert.equal(deleted.length, 1);
      assert.ok(deleted[0]?.includes(oldDate));

      const remaining = await ReportStorage.listReports(testDir);
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0]?.dateStr, recentDate);
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });
});