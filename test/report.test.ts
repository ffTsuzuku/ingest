import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatReportMarkdown, generateEmptyReport } from "../src/report/generator.js";

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
