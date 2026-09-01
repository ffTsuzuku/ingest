import { describe, it } from "node:test";
import assert from "node:assert";
import { formatReport, toJson, toHtml, toSlack } from "../src/report/formatter.js";
import type { ReportMeta } from "../src/report/types.js";

const mockMeta: ReportMeta = {
  repoName: "test-repo",
  repoPath: "/tmp/test-repo",
  branches: ["main"],
  branch: "main",
  dateStr: "2026-08-31",
  generatedAt: "2026-08-31T12:00:00.000Z",
  providerLabel: "test-provider",
  commitCount: 5,
  reportStyle: "default",
};

const sampleMarkdown = `# Test Repo - 2026-08-31

## Summary
This is a **test report** with \`inline code\`.

- Item one
- Item two

---
*Generated on 2026-08-31*
`;

describe("Report Formatter", () => {
  it("should return markdown as-is for markdown format", () => {
    const result = formatReport(sampleMarkdown, mockMeta, "markdown");
    assert.deepStrictEqual(result.content, sampleMarkdown);
    assert.deepStrictEqual(result.format, "markdown");
    assert.deepStrictEqual(result.fileExtension, ".md");
  });

  it("should produce valid JSON with meta and content", () => {
    const result = toJson(sampleMarkdown, mockMeta);
    assert.deepStrictEqual(result.format, "json");
    assert.deepStrictEqual(result.fileExtension, ".json");
    const parsed = JSON.parse(result.content);
    assert.deepStrictEqual(parsed.meta.repoName, "test-repo");
    assert.deepStrictEqual(parsed.meta.commitCount, 5);
    assert.ok(parsed.content.includes("Test Repo"));
  });

  it("should produce HTML with doctype and styling", () => {
    const result = toHtml(sampleMarkdown, mockMeta);
    assert.deepStrictEqual(result.format, "html");
    assert.deepStrictEqual(result.fileExtension, ".html");
    assert.ok(result.content.includes("<!DOCTYPE html>"));
    assert.ok(result.content.includes("<style>"));
    assert.ok(result.content.includes("test-repo"));
  });

  it("should produce Slack mrkdwn with bold headers", () => {
    const result = toSlack(sampleMarkdown, mockMeta);
    assert.deepStrictEqual(result.format, "slack");
    assert.deepStrictEqual(result.fileExtension, ".txt");
    // Headers should be converted to *bold*
    assert.ok(result.content.includes("*"));
    // Should not contain markdown # headers
    assert.ok(!result.content.includes("# Test Repo"));
  });

  it("should handle default format gracefully", () => {
    const result = formatReport(sampleMarkdown, mockMeta, "markdown");
    assert.deepStrictEqual(result.content, sampleMarkdown);
  });
});
