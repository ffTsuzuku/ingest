import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdownToAnsi, formatInlineMarkdown } from "../src/report/viewer.js";
import { stripAnsi } from "../src/tui/ansi.js";

describe("Markdown Terminal Renderer", () => {
  it("should format headers and bullet lists with ANSI codes", () => {
    const md = "# Auth Service Report\n\n## Key Changes\n- Added OAuth login\n- Fixed token refresh";
    const lines = renderMarkdownToAnsi(md);
    const plainText = lines.map(stripAnsi).join("\n");

    assert.ok(plainText.includes("Auth Service Report"));
    assert.ok(plainText.includes("Key Changes"));
    assert.ok(plainText.includes("• Added OAuth login"));
  });

  it("should format inline bold and code tags", () => {
    const formatted = formatInlineMarkdown("Use `git-ingest` with **strong** emphasis");
    const plain = stripAnsi(formatted);
    assert.equal(plain, "Use  git-ingest  with strong emphasis");
  });
});
