import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { IngestWebServer } from "../src/server/server.js";
import { renderDashboardHtml } from "../src/server/html.js";

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

  it("should start server and respond to /api/status, /api/repos, /api/reports, and /api/report", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "ingest-web-server-"));

    try {
      // Create mock reports for repo1 and repo2
      const repo1Dir = join(tempDir, "repo-alpha");
      const repo2Dir = join(tempDir, "repo-beta");
      await mkdir(repo1Dir, { recursive: true });
      await mkdir(repo2Dir, { recursive: true });

      const report1Path = join(repo1Dir, "2026-08-30-summary.md");
      const report1Content = "# repo-alpha - 2026-08-30\n\n### Summary\n- Fixed authentication bug";
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
      const reportJson = (await resReport.json()) as { content: string };
      assert.equal(reportJson.content, report1Content);

      // Test path traversal rejection
      const resTraversal = await fetch(`${info.url}/api/report?repo=..&file=secret.txt`);
      assert.ok(resTraversal.status === 403 || resTraversal.status === 404);

      await server.stop();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
