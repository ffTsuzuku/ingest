import { readFile } from "node:fs/promises";
import { ANSI, stripAnsi, wrapAnsiLine } from "../tui/ansi.js";

export function renderMarkdownToAnsi(markdown: string, maxWidth?: number): string[] {
  const terminalWidth = maxWidth ?? (process.stdout.columns ? Math.max(40, process.stdout.columns) : 80);
  const contentWidth = Math.max(30, terminalWidth - 2);
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
        const barWidth = Math.max(16, Math.min(contentWidth - 4, 64));
        output.push(`  ${ANSI.gray}╰${"─".repeat(barWidth)}${ANSI.reset}`);
      } else {
        inCodeBlock = true;
        codeBlockLang = (codeBlockMatch[1] ?? "").toLowerCase();
        const langBadge = codeBlockLang ? ` ${ANSI.bold}${ANSI.cyan}[${codeBlockLang}]${ANSI.gray} ` : " ";
        const langLen = codeBlockLang ? codeBlockLang.length + 4 : 1;
        const barWidth = Math.max(10, Math.min(contentWidth - 6 - langLen, 58));
        output.push(`  ${ANSI.gray}╭──${langBadge}${"─".repeat(barWidth)}${ANSI.reset}`);
      }
      continue;
    }

    if (inCodeBlock) {
      let codeFormatted = rawLine;
      if (codeBlockLang === "diff") {
        if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
          codeFormatted = `${ANSI.green}${rawLine}${ANSI.reset}`;
        } else if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
          codeFormatted = `${ANSI.red}${rawLine}${ANSI.reset}`;
        } else if (rawLine.startsWith("@@")) {
          codeFormatted = `${ANSI.cyan}${rawLine}${ANSI.reset}`;
        } else if (rawLine.startsWith("diff --git") || rawLine.startsWith("---") || rawLine.startsWith("+++")) {
          codeFormatted = `${ANSI.bold}${ANSI.yellow}${rawLine}${ANSI.reset}`;
        } else {
          codeFormatted = `${ANSI.dim}${rawLine}${ANSI.reset}`;
        }
      } else {
        codeFormatted = `${ANSI.brightWhite}${rawLine}${ANSI.reset}`;
      }

      const prefix = `  ${ANSI.gray}│${ANSI.reset} `;
      const hanging = `  ${ANSI.gray}│${ANSI.reset}   `;
      const wrapped = wrapAnsiLine(`${prefix}${codeFormatted}`, contentWidth, hanging);
      output.push(...wrapped);
      continue;
    }

    // Headers
    if (rawLine.startsWith("# ")) {
      const title = rawLine.slice(2).trim();
      const formattedTitle = formatInlineMarkdown(title);
      const titleVisibleLen = stripAnsi(formattedTitle).length;
      const barLen = Math.max(30, Math.min(contentWidth - 4, Math.max(40, titleVisibleLen + 6)));
      output.push("");
      output.push(`  ${ANSI.bold}${ANSI.brightCyan}◆  ${formattedTitle}${ANSI.reset}`);
      output.push(`  ${ANSI.gray}${"─".repeat(barLen)}${ANSI.reset}`);
      output.push("");
      continue;
    }

    if (rawLine.startsWith("## ")) {
      const section = rawLine.slice(3).trim();
      const formattedSection = formatInlineMarkdown(section);
      const barLen = Math.max(20, Math.min(contentWidth - 4, 64));
      output.push("");
      output.push(`  ${ANSI.bold}${ANSI.brightYellow}▸  ${formattedSection}${ANSI.reset}`);
      output.push(`  ${ANSI.gray}${"┄".repeat(barLen)}${ANSI.reset}`);
      continue;
    }

    if (rawLine.startsWith("### ")) {
      const subsection = rawLine.slice(4).trim();
      const formattedSub = formatInlineMarkdown(subsection);
      const prefix = `    ${ANSI.bold}${ANSI.brightMagenta}▪  `;
      const hanging = "       ";
      const wrapped = wrapAnsiLine(`${prefix}${formattedSub}${ANSI.reset}`, contentWidth, hanging);
      output.push("");
      output.push(...wrapped);
      continue;
    }

    if (rawLine.startsWith("#### ")) {
      const subsubsection = rawLine.slice(5).trim();
      const formattedSubSub = formatInlineMarkdown(subsubsection);
      const prefix = `      ${ANSI.bold}${ANSI.cyan}▫  `;
      const hanging = "         ";
      const wrapped = wrapAnsiLine(`${prefix}${formattedSubSub}${ANSI.reset}`, contentWidth, hanging);
      output.push(...wrapped);
      continue;
    }

    // Horizontal rules
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(rawLine.trim())) {
      const barLen = Math.max(20, Math.min(contentWidth - 4, 64));
      output.push(`  ${ANSI.gray}${"─".repeat(barLen)}${ANSI.reset}`);
      continue;
    }

    // Blockquotes
    if (rawLine.startsWith("> ")) {
      const content = formatInlineMarkdown(rawLine.slice(2));
      const prefix = `  ${ANSI.blue}│${ANSI.reset} ${ANSI.italic}`;
      const hanging = `  ${ANSI.blue}│${ANSI.reset} ${ANSI.italic}`;
      const wrapped = wrapAnsiLine(`${prefix}${content}${ANSI.reset}`, contentWidth, hanging);
      output.push(...wrapped);
      continue;
    }

    // Bullet lists
    if (/^\s*[-*+]\s+/.test(rawLine)) {
      const indentMatch = rawLine.match(/^(\s*)/);
      const indentLevel = indentMatch ? indentMatch[1]?.length ?? 0 : 0;
      const content = rawLine.replace(/^\s*[-*+]\s+/, "");
      const formatted = formatInlineMarkdown(content);

      let bulletChar: string;
      let prefixSpaces: string;
      let hangingSpaces: string;

      if (indentLevel >= 4) {
        bulletChar = `${ANSI.gray}▫${ANSI.reset}`;
        prefixSpaces = "      ";
        hangingSpaces = "        ";
      } else if (indentLevel >= 2) {
        bulletChar = `${ANSI.yellow}◦${ANSI.reset}`;
        prefixSpaces = "    ";
        hangingSpaces = "      ";
      } else {
        bulletChar = `${ANSI.cyan}•${ANSI.reset}`;
        prefixSpaces = "  ";
        hangingSpaces = "    ";
      }

      const fullLine = `${prefixSpaces}${bulletChar} ${formatted}`;
      const wrapped = wrapAnsiLine(fullLine, contentWidth, hangingSpaces);
      output.push(...wrapped);
      continue;
    }

    // Numbered lists (e.g. 1. , 2. )
    const numMatch = rawLine.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (numMatch) {
      const indentLevel = numMatch[1]?.length ?? 0;
      const num = numMatch[2] ?? "1";
      const content = numMatch[3] ?? "";
      const formatted = formatInlineMarkdown(content);
      const prefixSpaces = " ".repeat(indentLevel + 2);
      const numLabel = `${ANSI.cyan}${num}.${ANSI.reset}`;
      const hangingSpaces = " ".repeat(indentLevel + 2 + num.length + 2);
      const fullLine = `${prefixSpaces}${numLabel} ${formatted}`;
      const wrapped = wrapAnsiLine(fullLine, contentWidth, hangingSpaces);
      output.push(...wrapped);
      continue;
    }

    // Standard lines
    if (rawLine.trim() === "") {
      output.push("");
    } else {
      const formatted = formatInlineMarkdown(rawLine);
      const prefix = "  ";
      const hanging = "  ";
      const wrapped = wrapAnsiLine(`${prefix}${formatted}`, contentWidth, hanging);
      output.push(...wrapped);
    }
  }

  return output;
}

export function formatInlineMarkdown(text: string): string {
  return text
    // 1. Commit hash links: [`12bca56`](file:///...) or [12bca56](file:///...)
    .replace(/\[`?([0-9a-f]{7,12})`?\]\(([^)]+)\)/g, (_match, hash, url) => {
      return `\x1b]8;;${url}\x07[${ANSI.bold}${ANSI.brightYellow}${hash}${ANSI.reset}]\x1b]8;;\x07`;
    })
    // 2. Code/File links: [`src/index.ts`](file:///...)
    .replace(/\[`([^`]+)`\]\(([^)]+)\)/g, (_match, label, url) => {
      return `\x1b]8;;${url}\x07${ANSI.cyan}${ANSI.underline}${label}${ANSI.reset}\x1b]8;;\x07`;
    })
    // 3. General Markdown links: [Title](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
      return `\x1b]8;;${url}\x07${ANSI.cyan}${ANSI.underline}${label}${ANSI.reset}\x1b]8;;\x07`;
    })
    // 4. Standalone commit hash format: [abc1234] or [`abc1234`]
    .replace(/\[`?([0-9a-f]{7,12})`?\]/g, `[${ANSI.bold}${ANSI.brightYellow}$1${ANSI.reset}]`)
    // 5. Technical section keywords bolded with bright cyan
    .replace(
      /\*\*(What Changed|Why & How|Impact|Implementation|Rationale|Breaking Changes|Configuration & Dependency Updates|Testing & Quality Assurance|Files|Who|What|Subject|Author|Date|Timestamp):\*\*/g,
      `${ANSI.bold}${ANSI.brightCyan}$1:${ANSI.reset}`,
    )
    // 6. General Bold: **text** or __text__
    .replace(/\*\*([^*]+)\*\*/g, `${ANSI.bold}$1${ANSI.reset}`)
    .replace(/__([^_]+)__/g, `${ANSI.bold}$1${ANSI.reset}`)
    // 7. Author badge: (*author*) -> dimmed italic
    .replace(/\(\*([^*]+)\*\)/g, `(${ANSI.dim}${ANSI.italic}$1${ANSI.reset})`)
    // 8. General Italic: *text* or _text_
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, `${ANSI.italic}$1${ANSI.reset}`)
    .replace(/(?<!_)_([^_]+)_(?!_)/g, `${ANSI.italic}$1${ANSI.reset}`)
    // 9. Strikethrough: ~~text~~
    .replace(/~~([^~]+)~~/g, `${ANSI.strikethrough}$1${ANSI.reset}`)
    // 10. Inline code: `text`
    .replace(/`([^`]+)`/g, `${ANSI.cyan}$1${ANSI.reset}`)
    // 11. Diff stats: +12, -4, (+61, -0)
    .replace(/(?<=[\s(,]|^)\+(\d+)/g, `${ANSI.green}+$1${ANSI.reset}`)
    .replace(/(?<=[\s(,]|^)\-(\d+)/g, `${ANSI.red}-$1${ANSI.reset}`);
}

export async function renderReportFileToAnsi(filePath: string, maxWidth?: number): Promise<string[]> {
  const content = await readFile(filePath, "utf8");
  return renderMarkdownToAnsi(content, maxWidth);
}

