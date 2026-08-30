import { readFile } from "node:fs/promises";
import { ANSI, stripAnsi } from "../tui/ansi.js";

export function renderMarkdownToAnsi(markdown: string): string[] {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = "";

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? "";

    // Code block check
    const codeBlockMatch = rawLine.match(/^```(\w*)/);
    if (codeBlockMatch) {
      if (inCodeBlock) {
        inCodeBlock = false;
        output.push(`  ${ANSI.gray}└──────────────────────────────────────────────${ANSI.reset}`);
      } else {
        inCodeBlock = true;
        codeBlockLang = codeBlockMatch[1] ?? "";
        output.push(`  ${ANSI.gray}┌── ${ANSI.cyan}${codeBlockLang || "code"}${ANSI.gray} ─────────────────────────────${ANSI.reset}`);
      }
      continue;
    }

    if (inCodeBlock) {
      output.push(`  ${ANSI.gray}│${ANSI.reset} ${ANSI.green}${rawLine}${ANSI.reset}`);
      continue;
    }

    // Headers
    if (rawLine.startsWith("# ")) {
      const title = rawLine.slice(2).trim();
      output.push("");
      output.push(`${ANSI.bold}${ANSI.brightCyan}╔══════════════════════════════════════════════════════════════╗${ANSI.reset}`);
      output.push(`${ANSI.bold}${ANSI.brightCyan}║  ${title.padEnd(58)}  ║${ANSI.reset}`);
      output.push(`${ANSI.bold}${ANSI.brightCyan}╚══════════════════════════════════════════════════════════════╝${ANSI.reset}`);
      output.push("");
      continue;
    }

    if (rawLine.startsWith("## ")) {
      const section = rawLine.slice(3).trim();
      output.push("");
      output.push(`${ANSI.bold}${ANSI.brightYellow}━━━ ${section} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${ANSI.reset}`);
      continue;
    }

    if (rawLine.startsWith("### ")) {
      const subsection = rawLine.slice(4).trim();
      output.push("");
      output.push(`${ANSI.bold}${ANSI.yellow}▶ ${subsection}${ANSI.reset}`);
      continue;
    }

    // Horizontal rules
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(rawLine.trim())) {
      output.push(`${ANSI.gray}${"─".repeat(64)}${ANSI.reset}`);
      continue;
    }

    // Blockquotes
    if (rawLine.startsWith("> ")) {
      output.push(`  ${ANSI.magenta}▎${ANSI.reset} ${ANSI.italic}${rawLine.slice(2)}${ANSI.reset}`);
      continue;
    }

    // Bullet lists
    if (/^\s*[-*+]\s+/.test(rawLine)) {
      const indent = rawLine.match(/^(\s*)/)?.[1] || "";
      const content = rawLine.replace(/^\s*[-*+]\s+/, "");
      const formatted = formatInlineMarkdown(content);
      output.push(`${indent}  ${ANSI.cyan}•${ANSI.reset} ${formatted}`);
      continue;
    }

    // Diff stats coloring
    if (/^\s*(Who:|What:|Files:)/.test(rawLine)) {
      const formatted = rawLine
        .replace(/^(Who:)/, `${ANSI.bold}${ANSI.brightBlue}$1${ANSI.reset}`)
        .replace(/^(What:)/, `${ANSI.bold}${ANSI.brightGreen}$1${ANSI.reset}`)
        .replace(/^(Files:)/, `${ANSI.bold}${ANSI.brightYellow}$1${ANSI.reset}`);
      output.push(`    ${formatted}`);
      continue;
    }

    // Format standard lines
    if (rawLine.trim() === "") {
      output.push("");
    } else {
      output.push(formatInlineMarkdown(rawLine));
    }
  }

  return output;
}

export function formatInlineMarkdown(text: string): string {
  return text
    // Bold: **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, `${ANSI.bold}$1${ANSI.reset}`)
    .replace(/__(.+?)__/g, `${ANSI.bold}$1${ANSI.reset}`)
    // Italic: *text* or _text_
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, `${ANSI.italic}$1${ANSI.reset}`)
    .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, `${ANSI.italic}$1${ANSI.reset}`)
    // Inline code: `text`
    .replace(/`([^`]+)`/g, `${ANSI.bgBlack}${ANSI.brightCyan} $1 ${ANSI.reset}`)
    // Additions and deletions
    .replace(/(\+\d+)/g, `${ANSI.green}$1${ANSI.reset}`)
    .replace(/(\-\d+)/g, `${ANSI.red}$1${ANSI.reset}`);
}

export async function renderReportFileToAnsi(filePath: string): Promise<string[]> {
  const content = await readFile(filePath, "utf8");
  return renderMarkdownToAnsi(content);
}
