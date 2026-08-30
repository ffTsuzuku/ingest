import { readFile } from "node:fs/promises";
import { ANSI, stripAnsi, wrapAnsiLine, visibleLength } from "../tui/ansi.js";

export function renderMermaidToAnsi(codeLines: string[], contentWidth: number): string[] {
  const barWidth = Math.max(20, Math.min(contentWidth - 4, 72));
  const output: string[] = [];

  output.push("");
  output.push(`  ${ANSI.gray}╭── ${ANSI.bold}${ANSI.brightCyan}[📊 Architecture & Execution Flow]${ANSI.reset} ${ANSI.gray}${"─".repeat(Math.max(2, barWidth - 36))}${ANSI.reset}`);
  output.push(`  ${ANSI.gray}│${ANSI.reset}`);

  const nodes = new Map<string, string>();
  const flows: Array<{ from: string; to: string; label?: string }> = [];

  const cleanText = (str: string): string => {
    return str
      .replace(/<br\s*\/?>\s*<code>(.*?)<\/code>/gi, " ($1)")
      .replace(/<br\s*\/?>/gi, " - ")
      .replace(/<code>(.*?)<\/code>/gi, "($1)")
      .replace(/<[^>]+>/g, "")
      .replace(/\\n/g, " ")
      .replace(/"/g, "")
      .trim();
  };

  for (const rawLine of codeLines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("flowchart") || line.startsWith("graph") || line.startsWith("sequenceDiagram")) {
      continue;
    }

    // 1. Node declarations: ID["Label<br/><code>path</code>"] or ID[Label]
    const nodeMatch = line.match(/^([A-Za-z0-9_-]+)\s*(?:\["([^"]+)"\]|\[([^\]]+)\]|\("([^"]+)"\)|\(([^)]+)\))/);
    if (nodeMatch) {
      const id = nodeMatch[1]!;
      const label = cleanText(nodeMatch[2] || nodeMatch[3] || nodeMatch[4] || nodeMatch[5] || id);
      nodes.set(id, label);
    }

    // 2. Connection flows: A -->|Label| B or A --> B
    const flowMatch = line.match(/([A-Za-z0-9_-]+)\s*(?:-->|==>|-\.->)\s*(?:\|([^|]+)\|)?\s*([A-Za-z0-9_-]+)/);
    if (flowMatch) {
      const from = flowMatch[1]!;
      const label = flowMatch[2] ? cleanText(flowMatch[2]) : undefined;
      const to = flowMatch[3]!;
      flows.push({ from, to, label });
    }
  }

  // If we parsed nodes, output component summary
  if (nodes.size > 0) {
    output.push(`  ${ANSI.gray}│${ANSI.reset}  ${ANSI.bold}${ANSI.yellow}◆ Architecture Components:${ANSI.reset}`);
    const maxIdLen = Math.max(...Array.from(nodes.keys()).map((k) => k.length));

    for (const [id, label] of nodes.entries()) {
      const pad = " ".repeat(Math.max(1, maxIdLen - id.length + 1));
      const formattedLabel = formatInlineMarkdown(label);
      const line = `  ${ANSI.gray}│${ANSI.reset}    ${ANSI.cyan}•${ANSI.reset} ${ANSI.bold}${ANSI.brightWhite}${id}${ANSI.reset}${pad}${ANSI.gray}│${ANSI.reset} ${formattedLabel}`;
      const wrapped = wrapAnsiLine(line, contentWidth, `  ${ANSI.gray}│${ANSI.reset}      ${" ".repeat(maxIdLen + 2)}`);
      output.push(...wrapped);
    }
    output.push(`  ${ANSI.gray}│${ANSI.reset}`);
  }

  // If we parsed flows, output execution flows
  if (flows.length > 0) {
    output.push(`  ${ANSI.gray}│${ANSI.reset}  ${ANSI.bold}${ANSI.yellow}▸ Execution & Dependency Flows:${ANSI.reset}`);
    for (const flow of flows) {
      const fromName = `${ANSI.bold}${ANSI.brightWhite}${flow.from}${ANSI.reset}`;
      const toName = `${ANSI.bold}${ANSI.brightWhite}${flow.to}${ANSI.reset}`;
      const arrow = flow.label
        ? `${ANSI.gray}──[${ANSI.cyan}${flow.label}${ANSI.gray}]──►${ANSI.reset}`
        : `${ANSI.gray}────►${ANSI.reset}`;

      const flowLine = `  ${ANSI.gray}│${ANSI.reset}    ${fromName} ${arrow} ${toName}`;
      const wrapped = wrapAnsiLine(flowLine, contentWidth, `  ${ANSI.gray}│${ANSI.reset}      `);
      output.push(...wrapped);
    }
    output.push(`  ${ANSI.gray}│${ANSI.reset}`);
  }

  // Fallback if unstructured
  if (nodes.size === 0 && flows.length === 0) {
    for (const raw of codeLines) {
      const cleaned = cleanText(raw);
      if (!cleaned) continue;
      const line = `  ${ANSI.gray}│${ANSI.reset}  ${ANSI.cyan}${cleaned}${ANSI.reset}`;
      output.push(...wrapAnsiLine(line, contentWidth, `  ${ANSI.gray}│${ANSI.reset}    `));
    }
    output.push(`  ${ANSI.gray}│${ANSI.reset}`);
  }

  // Tip badge
  output.push(`  ${ANSI.gray}│${ANSI.reset}  ${ANSI.dim}${ANSI.italic}💡 Tip: Launch interactive pan/zoom diagrams with '${ANSI.yellow}ingest --ui${ANSI.reset}${ANSI.dim}${ANSI.italic}'${ANSI.reset}`);
  output.push(`  ${ANSI.gray}╰${"─".repeat(barWidth)}${ANSI.reset}`);
  output.push("");

  return output;
}

export function renderTableToAnsi(headers: string[], rows: string[][], contentWidth: number): string[] {
  if (headers.length === 0) return [];
  const colCount = headers.length;
  const borderOverhead = 3 * colCount + 3;
  const availableWidth = Math.max(colCount * 6, contentWidth - borderOverhead);

  // 1. Natural widths
  const naturalWidths = headers.map((h, colIdx) => {
    let max = visibleLength(formatInlineMarkdown(h));
    for (const row of rows) {
      const cell = row[colIdx] ?? "";
      const len = visibleLength(formatInlineMarkdown(cell));
      if (len > max) max = len;
    }
    return Math.max(4, max);
  });

  const totalNatural = naturalWidths.reduce((a, b) => a + b, 0);

  // 2. Proportional distribution
  let colWidths: number[];
  if (totalNatural <= availableWidth) {
    colWidths = [...naturalWidths];
  } else {
    colWidths = naturalWidths.map((w) => Math.max(6, Math.floor((w / totalNatural) * availableWidth)));
    let currentTotal = colWidths.reduce((a, b) => a + b, 0);
    let diff = availableWidth - currentTotal;
    let idx = 0;
    while (diff > 0 && idx < colCount) {
      colWidths[idx]! += 1;
      diff--;
      idx = (idx + 1) % colCount;
    }
  }

  const output: string[] = [];

  // Top border: ┌──────┬──────┐
  const topBorder = `  ${ANSI.gray}┌${colWidths.map((w) => "─".repeat(w + 2)).join("┬")}┐${ANSI.reset}`;
  output.push("");
  output.push(topBorder);

  // Header row
  const headerWrapped = headers.map((h, colIdx) => {
    const formatted = `${ANSI.bold}${ANSI.brightCyan}${formatInlineMarkdown(h)}${ANSI.reset}`;
    return wrapAnsiLine(formatted, colWidths[colIdx] ?? 10);
  });
  const headerHeight = Math.max(...headerWrapped.map((lines) => lines.length), 1);

  for (let lineIdx = 0; lineIdx < headerHeight; lineIdx++) {
    const cells = headers.map((_, colIdx) => {
      const w = colWidths[colIdx] ?? 10;
      const lineText = headerWrapped[colIdx]?.[lineIdx] ?? "";
      const vis = visibleLength(lineText);
      const pad = Math.max(0, w - vis);
      return `${lineText}${" ".repeat(pad)}`;
    });
    output.push(`  ${ANSI.gray}│${ANSI.reset} ` + cells.join(` ${ANSI.gray}│${ANSI.reset} `) + ` ${ANSI.gray}│${ANSI.reset}`);
  }

  // Mid border: ├──────┼──────┤
  const midBorder = `  ${ANSI.gray}├${colWidths.map((w) => "─".repeat(w + 2)).join("┼")}┤${ANSI.reset}`;
  output.push(midBorder);

  // Data rows
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    const rowWrapped = headers.map((_, colIdx) => {
      const cellText = row[colIdx] ?? "";
      const formatted = formatInlineMarkdown(cellText);
      return wrapAnsiLine(formatted, colWidths[colIdx] ?? 10);
    });
    const rowHeight = Math.max(...rowWrapped.map((lines) => lines.length), 1);

    for (let lineIdx = 0; lineIdx < rowHeight; lineIdx++) {
      const cells = headers.map((_, colIdx) => {
        const w = colWidths[colIdx] ?? 10;
        const lineText = rowWrapped[colIdx]?.[lineIdx] ?? "";
        const vis = visibleLength(lineText);
        const pad = Math.max(0, w - vis);
        return `${lineText}${" ".repeat(pad)}`;
      });
      output.push(`  ${ANSI.gray}│${ANSI.reset} ` + cells.join(` ${ANSI.gray}│${ANSI.reset} `) + ` ${ANSI.gray}│${ANSI.reset}`);
    }

    // Row divider if more rows follow
    if (r < rows.length - 1) {
      const rowDivider = `  ${ANSI.gray}├${colWidths.map((w) => "─".repeat(w + 2)).join("┼")}┤${ANSI.reset}`;
      output.push(rowDivider);
    }
  }

  // Bottom border: └──────┴──────┘
  const bottomBorder = `  ${ANSI.gray}└${colWidths.map((w) => "─".repeat(w + 2)).join("┴")}┘${ANSI.reset}`;
  output.push(bottomBorder);
  output.push("");

  return output;
}

export function renderMarkdownToAnsi(markdown: string, maxWidth?: number): string[] {
  const terminalWidth = maxWidth ?? (process.stdout.columns ? Math.max(40, process.stdout.columns) : 80);
  const contentWidth = Math.max(30, terminalWidth - 2);
  const lines = markdown.split("\n");
  const output: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? "";

    // Code block check
    const codeBlockMatch = rawLine.match(/^```(\w*)/);
    if (codeBlockMatch) {
      if (inCodeBlock) {
        inCodeBlock = false;
        const isMermaid =
          codeBlockLang === "mermaid" ||
          (!codeBlockLang && codeBuffer.some((l) => /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram)\b/i.test(l.trim()))) ||
          (codeBlockLang === "text" && codeBuffer.some((l) => /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram)\b/i.test(l.trim())));

        if (isMermaid) {
          output.push(...renderMermaidToAnsi(codeBuffer, contentWidth));
        } else {
          const langBadge = codeBlockLang ? ` ${ANSI.bold}${ANSI.cyan}[${codeBlockLang}]${ANSI.gray} ` : " ";
          const langLen = codeBlockLang ? codeBlockLang.length + 4 : 1;
          const barWidth = Math.max(10, Math.min(contentWidth - 6 - langLen, 58));
          output.push(`  ${ANSI.gray}╭──${langBadge}${"─".repeat(barWidth)}${ANSI.reset}`);

          for (const rawCodeLine of codeBuffer) {
            let codeFormatted = rawCodeLine;
            if (codeBlockLang === "diff") {
              if (rawCodeLine.startsWith("+") && !rawCodeLine.startsWith("+++")) {
                codeFormatted = `${ANSI.green}${rawCodeLine}${ANSI.reset}`;
              } else if (rawCodeLine.startsWith("-") && !rawCodeLine.startsWith("---")) {
                codeFormatted = `${ANSI.red}${rawCodeLine}${ANSI.reset}`;
              } else if (rawCodeLine.startsWith("@@")) {
                codeFormatted = `${ANSI.cyan}${rawCodeLine}${ANSI.reset}`;
              } else if (rawCodeLine.startsWith("diff --git") || rawCodeLine.startsWith("---") || rawCodeLine.startsWith("+++")) {
                codeFormatted = `${ANSI.bold}${ANSI.yellow}${rawCodeLine}${ANSI.reset}`;
              } else {
                codeFormatted = `${ANSI.dim}${rawCodeLine}${ANSI.reset}`;
              }
            } else {
              codeFormatted = `${ANSI.brightWhite}${rawCodeLine}${ANSI.reset}`;
            }

            const prefix = `  ${ANSI.gray}│${ANSI.reset} `;
            const hanging = `  ${ANSI.gray}│${ANSI.reset}   `;
            const wrapped = wrapAnsiLine(`${prefix}${codeFormatted}`, contentWidth, hanging);
            output.push(...wrapped);
          }

          const endBarWidth = Math.max(16, Math.min(contentWidth - 4, 64));
          output.push(`  ${ANSI.gray}╰${"─".repeat(endBarWidth)}${ANSI.reset}`);
        }

        codeBuffer = [];
        codeBlockLang = "";
      } else {
        inCodeBlock = true;
        codeBlockLang = (codeBlockMatch[1] ?? "").toLowerCase();
        codeBuffer = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(rawLine);
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
      output.push("");
      output.push(...wrapped);
      continue;
    }

    // Horizontal rules
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(rawLine.trim())) {
      const barLen = Math.max(20, Math.min(contentWidth - 4, 64));
      output.push(`  ${ANSI.gray}${"─".repeat(barLen)}${ANSI.reset}`);
      continue;
    }

    // Markdown Table detection in terminal pager
    if (rawLine.includes("|") && i + 1 < lines.length) {
      const nextLine = lines[i + 1] ?? "";
      const isDelimiter =
        nextLine.includes("|") &&
        nextLine.includes("-") &&
        nextLine
          .trim()
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean)
          .every((p) => /^:?-+:?$/.test(p));

      if (isDelimiter) {
        const parseRow = (str: string) => {
          let s = str.trim();
          if (s.startsWith("|")) s = s.slice(1);
          if (s.endsWith("|")) s = s.slice(0, -1);
          return s.split("|").map((c) => c.trim());
        };

        const headers = parseRow(rawLine);
        const rows: string[][] = [];
        i++; // skip delimiter

        while (i + 1 < lines.length) {
          const nextRow = lines[i + 1] ?? "";
          if (nextRow.trim() === "" || (!nextRow.includes("|") && !nextRow.trim().startsWith("|"))) break;
          if (/^(\-{3,}|\*{3,}|_{3,})$/.test(nextRow.trim())) break;
          i++;
          rows.push(parseRow(lines[i] ?? ""));
        }

        output.push(...renderTableToAnsi(headers, rows, contentWidth));
        continue;
      }
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

