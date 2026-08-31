import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseTokenUsageFromMarkdown,
  formatTokenCount,
} from "../src/ai/tokens.js";

describe("Token Usage Tracker", () => {
  it("should format token counts and return N/A when missing or invalid", () => {
    assert.equal(formatTokenCount(undefined), "N/A");
    assert.equal(formatTokenCount(null), "N/A");
    assert.equal(formatTokenCount(0), "N/A");
    assert.equal(formatTokenCount(-5), "N/A");
    assert.equal(formatTokenCount(500), "500");
    assert.equal(formatTokenCount(2500), "2.5k");
    assert.equal(formatTokenCount(14104), "14.1k");
    assert.equal(formatTokenCount(1500000), "1.5M");
  });

  it("should parse exact token usage from markdown footer", () => {
    const markdown = `# Report
Some content here.

---
*Generated on 2026-08-30T10:00:00Z via \`agy:gemini-3.7-flash\` (5 commits analyzed across branches: main) • 14,104 tokens*
`;

    const parsed = parseTokenUsageFromMarkdown(markdown);
    assert.ok(parsed);
    assert.equal(parsed.totalTokens, 14104);
  });

  it("should return null when token record is not present in markdown", () => {
    const legacyMarkdown = `# Legacy Report\n\nSome long technical report without token footer.\n\n---\n*Generated on 2026-08-30 (5 commits analyzed)*`;
    const parsed = parseTokenUsageFromMarkdown(legacyMarkdown);
    assert.equal(parsed, null);
  });
});
