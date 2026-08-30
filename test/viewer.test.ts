import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdownToAnsi, formatInlineMarkdown } from "../src/report/viewer.js";
import { stripAnsi, visibleLength, wrapAnsiLine, truncate } from "../src/tui/ansi.js";

describe("Markdown Terminal Renderer", () => {
  it("should format headers and bullet lists with ANSI codes", () => {
    const md = "# Auth Service Report\n\n## Key Changes\n- Added OAuth login\n- Fixed token refresh";
    const lines = renderMarkdownToAnsi(md);
    const plainText = lines.map(stripAnsi).join("\n");

    assert.ok(plainText.includes("Auth Service Report"));
    assert.ok(plainText.includes("Key Changes"));
    assert.ok(plainText.includes("• Added OAuth login"));
  });

  it("should format inline bold, code tags, and links", () => {
    const formatted = formatInlineMarkdown("Use `ingest` with **strong** emphasis and [docs](file:///path/to/docs)");
    const plain = stripAnsi(formatted);
    assert.equal(plain, "Use ingest with strong emphasis and docs");
    assert.ok(formatted.includes("\x1b]8;;file:///path/to/docs\x07"));
  });

  it("should format commit hash links with yellow highlight and OSC 8 hyperlinks", () => {
    const formatted = formatInlineMarkdown("Commit [`12bca56`](file:///Users/dev/repo/src/ai.ts) updated");
    const plain = stripAnsi(formatted);
    assert.equal(plain, "Commit [12bca56] updated");
    assert.ok(formatted.includes("\x1b]8;;file:///Users/dev/repo/src/ai.ts\x07"));
  });

  it("should wrap long bullet points with proper hanging indentation", () => {
    const md = "- Implementation: Implemented AntigravityProvider implementing AIProvider, configured with non-interactive CLI execution args (--print, --dangerously-skip-permissions, --model, --effort).";
    const lines = renderMarkdownToAnsi(md, 50);

    assert.ok(lines.length > 1);
    // First line should start with bullet "  • "
    assert.ok(lines[0]?.startsWith("  \x1b[36m•\x1b[0m") || stripAnsi(lines[0] || "").startsWith("  •"));
    // Subsequent continuation lines should start with hanging indent of 4 spaces
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i] ?? "";
      assert.ok(stripAnsi(line).startsWith("    "), `Continuation line ${i} must start with 4-space hanging indent: "${line}"`);
      assert.ok(visibleLength(line) <= 50, `Line ${i} visible length (${visibleLength(line)}) must not exceed maxWidth (50)`);
    }
  });

  it("should accurately calculate visible length and strip OSC 8 and CSI codes", () => {
    const styledText = "\x1b]8;;https://example.com\x07\x1b[1m\x1b[36mClick Here\x1b[0m\x1b]8;;\x07";
    assert.equal(stripAnsi(styledText), "Click Here");
    assert.equal(visibleLength(styledText), 10);
  });

  it("should wrap plain and ANSI lines cleanly without splitting words", () => {
    const input = "This is a quick test of word wrapping in ingest terminal renderer";
    const wrapped = wrapAnsiLine(input, 25, "  ");
    assert.ok(wrapped.length > 1);
    for (const w of wrapped) {
      assert.ok(visibleLength(w) <= 25);
    }
    assert.equal(wrapped.map(stripAnsi).join(" ").replace(/\s+/g, " "), input);
  });

  it("should render diff code blocks with syntax highlighting", () => {
    const md = "```diff\n+const a = 1;\n-const a = 0;\n@@ -1,2 +1,2 @@\n```";
    const lines = renderMarkdownToAnsi(md);
    const plainText = lines.map(stripAnsi).join("\n");
    assert.ok(plainText.includes("+const a = 1;"));
    assert.ok(plainText.includes("-const a = 0;"));
    assert.ok(plainText.includes("@@ -1,2 +1,2 @@"));
  });

  it("should truncate plain and ANSI styled lines safely without breaking styles", () => {
    const plain = "A very long line that should be truncated";
    const truncatedPlain = truncate(plain, 15);
    assert.equal(visibleLength(truncatedPlain), 15);
    assert.ok(truncatedPlain.endsWith("…"));

    const styled = "\x1b[1m\x1b[36mStyled Header That Is Quite Long\x1b[0m";
    const truncatedStyled = truncate(styled, 20);
    assert.equal(visibleLength(truncatedStyled), 20);
    assert.ok(truncatedStyled.includes("\x1b[1m"));
    assert.ok(truncatedStyled.endsWith("…"));
  });

  it("should render markdown tables with clean box borders", () => {
    const md = `
| Before | Now | Impact |
| :--- | :--- | :--- |
| Old CLI | New Ingest CLI | Improved UX |
| Single Repo | Multi-Repo | Centralized |
`;
    const lines = renderMarkdownToAnsi(md);
    const plainText = lines.map(stripAnsi).join("\n");

    assert.ok(plainText.includes("┌"));
    assert.ok(plainText.includes("Before"));
    assert.ok(plainText.includes("Now"));
    assert.ok(plainText.includes("Impact"));
    assert.ok(plainText.includes("Old CLI"));
    assert.ok(plainText.includes("New Ingest CLI"));
    assert.ok(plainText.includes("└"));
  });

  it("should wrap long table cell text across multiple lines within column width", () => {
    const md = `
| Setting | Old Behavior | New Behavior / Migration Impact |
| :--- | :--- | :--- |
| \`retention_days\` | Reports were stored indefinitely with no automatic expiration | Configurable retention period in days (default: 30) automatically prunes older markdown reports |
`;
    const lines = renderMarkdownToAnsi(md, 70);
    const plainText = lines.map(stripAnsi).join("\n");

    assert.ok(plainText.includes("Configurable"));
    assert.ok(plainText.includes("automatically"));
    assert.ok(plainText.includes("prunes"));
    assert.ok(plainText.includes("indefinitely"));
    for (const l of lines) {
      assert.ok(visibleLength(l) <= 70, `Line "${l}" (${visibleLength(l)}) exceeds max width 70`);
    }
  });

  it("should format mermaid diagrams into clean ANSI components and execution flows", () => {
    const md = `\`\`\`mermaid
flowchart TD
  CLI["CLI Parser<br/><code>src/index.ts</code>"]
  TUI["Terminal UI<br/><code>src/tui/</code>"]
  CLI -->|Interactive Mode| TUI
  CLI -->|Headless| Engine
\`\`\``;

    const lines = renderMarkdownToAnsi(md);
    const plainText = lines.map(stripAnsi).join("\n");

    assert.ok(plainText.includes("Architecture & Execution Flow"));
    assert.ok(plainText.includes("Architecture Components:"));
    assert.ok(plainText.includes("CLI"));
    assert.ok(plainText.includes("CLI Parser (src/index.ts)"));
    assert.ok(plainText.includes("Execution & Dependency Flows:"));
    assert.ok(plainText.includes("CLI ──[Interactive Mode]──► TUI"));
    assert.ok(plainText.includes("CLI ──[Headless]──► Engine"));
    assert.ok(!plainText.includes("<br/>"));
    assert.ok(!plainText.includes("<code>"));
  });
});



