import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { IngestWebServer } from "../src/server/server.js";
import { renderDashboardHtml } from "../src/server/html.js";
import vm from "node:vm";

describe("Web UI Server & Dashboard", () => {
  it("should render zero-dependency HTML dashboard SPA with table and mermaid diagram support", () => {
    const html = renderDashboardHtml();
    assert.ok(html.includes("<!DOCTYPE html>"));
    assert.ok(html.includes("Ingest"));
    assert.ok(html.includes("renderMarkdown"));
    assert.ok(html.includes("/api/repos"));
    assert.ok(html.includes("mermaid"));
    assert.ok(html.includes("table-container"));
    assert.ok(html.includes("isTableDelimiter"));
  });

  it("should format diffs with diff-line-add and not misidentify ascii box art", () => {
    const html = renderDashboardHtml();
    const sandbox: Record<string, unknown> = {
      window: {},
      document: { getElementById: () => ({ addEventListener: () => {} }) },
    };
    vm.createContext(sandbox);
    const startIdx = html.indexOf("function escapeHtml");
    const endIdx = html.indexOf("async function loadStatus");
    assert.ok(startIdx > 0 && endIdx > startIdx);

    vm.runInContext(
      `
      ${html.slice(startIdx, endIdx)}
      var resDiff = renderMarkdown('\`\`\`diff\\n+added line\\n-deleted line\\n@@ -1,1 +1,2 @@\\n\`\`\`');
      var resAscii = renderMarkdown('\`\`\`\\n+--------------------+\\n| Box Title          |\\n+--------------------+\\n\`\`\`');
      var resMermaid = renderMarkdown('\`\`\`mermaid\\nflowchart TD\\n  A --> B\\n\`\`\`');
    `,
      sandbox,
    );

    const resDiff = sandbox.resDiff as string;
    const resAscii = sandbox.resAscii as string;
    const resMermaid = sandbox.resMermaid as string;

    assert.ok(resDiff.includes("diff-line-add"));
    assert.ok(resDiff.includes("diff-line-del"));
    assert.ok(resDiff.includes("diff-line-chunk"));
    assert.ok(!resAscii.includes("diff-line-add"), "ASCII box lines starting with + must not have diff-line-add class");
    assert.ok(resMermaid.includes("mermaid-card"));
  });

  it("should start server and respond to /api/status, /api/repos, /api/reports, and /api/report", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "ingest-web-server-"));

    try {
      // Create mock reports for repo1 and repo2
      const repo1Dir = join(tempDir, "repo-alpha");
      const repo2Dir = join(tempDir, "repo-beta");
      await mkdir(repo1Dir, { recursive: true });
      await mkdir(repo2Dir, { recursive: true });

      const report1Path = join(repo1Dir, "2026-08-30-summary.md");
      const report1Content = "# repo-alpha - 2026-08-30\n\n### Summary\n- Fixed authentication bug\n\n---\n*Generated on 2026-08-30T10:00:00Z via `agy` (1 commits analyzed) • 1,250 tokens*";
      await writeFile(report1Path, report1Content, "utf8");

      const report2Path = join(repo2Dir, "2026-08-29-summary.md");
      const report2Content = "# repo-beta - 2026-08-29\n\n### Summary\n- Added billing checkout";
      await writeFile(report2Path, report2Content, "utf8");

      const server = new IngestWebServer({
        port: 0, // ephemeral port for test
        outputRoot: tempDir,
        activeRepo: "repo-alpha",
        openBrowser: false,
      });

      const info = await server.start();
      assert.ok(info.port > 0);
      assert.equal(info.activeRepo, "repo-alpha");

      // Test GET /
      const resHtml = await fetch(`${info.url}/`);
      assert.equal(resHtml.status, 200);
      const textHtml = await resHtml.text();
      assert.ok(textHtml.includes("Ingest"));

      // Test GET /api/status
      const resStatus = await fetch(`${info.url}/api/status`);
      assert.equal(resStatus.status, 200);
      const statusJson = (await resStatus.json()) as { activeRepo: string; outputRoot: string };
      assert.equal(statusJson.activeRepo, "repo-alpha");

      // Test GET /api/repos
      const resRepos = await fetch(`${info.url}/api/repos`);
      assert.equal(resRepos.status, 200);
      const reposJson = (await resRepos.json()) as Array<{ repoName: string; reportCount: number }>;
      assert.equal(reposJson.length, 2);
      assert.equal(reposJson[0]?.repoName, "repo-alpha");
      assert.equal(reposJson[0]?.reportCount, 1);
      assert.equal(reposJson[1]?.repoName, "repo-beta");
      assert.equal(reposJson[1]?.reportCount, 1);

      // Test GET /api/reports?repo=repo-alpha
      const resReports = await fetch(`${info.url}/api/reports?repo=repo-alpha`);
      assert.equal(resReports.status, 200);
      const reportsJson = (await resReports.json()) as Array<{ fileName: string; repoName: string }>;
      assert.equal(reportsJson.length, 1);
      assert.equal(reportsJson[0]?.fileName, "2026-08-30-summary.md");

      // Test GET /api/report?repo=repo-alpha&file=2026-08-30-summary.md
      const resReport = await fetch(`${info.url}/api/report?repo=repo-alpha&file=2026-08-30-summary.md`);
      assert.equal(resReport.status, 200);
      const reportJson = (await resReport.json()) as { content: string; tokenUsage?: { totalTokens: number } };
      assert.equal(reportJson.content, report1Content);
      assert.ok(reportJson.tokenUsage);
      assert.ok(reportJson.tokenUsage.totalTokens > 0);

      // Test POST /api/fix-mermaid missing parameters
      const resFixBad = await fetch(`${info.url}/api/fix-mermaid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(resFixBad.status, 400);

      // Test path traversal rejection
      const resTraversal = await fetch(`${info.url}/api/report?repo=..&file=secret.txt`);
      assert.ok(resTraversal.status === 403 || resTraversal.status === 404);

      // Verify server stops cleanly and idempotently
      await server.stop();
      // Calling stop again should not throw ERR_SERVER_NOT_RUNNING
      await assert.doesNotReject(async () => {
        await server.stop();
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("should close immediately even when client connections are open in keep-alive", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "ingest-web-server-keepalive-"));
    try {
      const server = new IngestWebServer({
        port: 0,
        outputRoot: tempDir,
        openBrowser: false,
      });

      const info = await server.start();

      // Open a keep-alive request
      const res = await fetch(`${info.url}/api/status`, {
        headers: { Connection: "keep-alive" },
      });
      assert.equal(res.status, 200);

      const startTime = Date.now();
      await server.stop();
      const elapsed = Date.now() - startTime;

      // Ensure server stop was near-instant (< 1000ms) rather than waiting on socket keep-alive timeout
      assert.ok(elapsed < 1000, `Expected server.stop() to resolve quickly, took ${elapsed}ms`);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
