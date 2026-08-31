import { ANSI, visibleLength, wrapAnsiLine } from "./ansi.js";
import { renderMarkdownToAnsi } from "../report/viewer.js";

export async function showTerminalPager(
  content: string[] | string,
  title = "Report Viewer",
): Promise<void> {
  const isMarkdown = typeof content === "string";

  if (!process.stdin.isTTY) {
    // Non-interactive fallback: just print the lines
    const plainLines = isMarkdown ? renderMarkdownToAnsi(content) : content;
    console.log(plainLines.join("\n"));
    return;
  }

  return new Promise((resolvePromise) => {
    let topRow = 0;
    let diagramMode: "2d" | "structured" = "2d";

    const getDisplayRows = (width: number): string[] => {
      const sourceLines = isMarkdown
        ? renderMarkdownToAnsi(content, width, { diagramMode })
        : content;
      const rows: string[] = [];
      for (const line of sourceLines) {
        if (visibleLength(line) > width) {
          rows.push(...wrapAnsiLine(line, width));
        } else {
          rows.push(line);
        }
      }
      return rows;
    };

    const render = () => {
      const height = process.stdout.rows || 24;
      const width = process.stdout.columns || 80;
      const pageHeight = Math.max(1, height - 2);

      const displayRows = getDisplayRows(width);
      const totalLines = displayRows.length;

      const maxTop = Math.max(0, totalLines - pageHeight);
      topRow = Math.min(topRow, maxTop);
      topRow = Math.max(0, topRow);

      const visibleLines = displayRows.slice(topRow, topRow + pageHeight);
      const output: string[] = [ANSI.clearScreen];

      // Header bar
      const startLineNum = totalLines > 0 ? topRow + 1 : 0;
      const endLineNum = Math.min(topRow + pageHeight, totalLines);
      const modeIndicator = isMarkdown
        ? ` [Mode: ${diagramMode === "2d" ? "2D Boxes" : "Structured"}]`
        : "";
      const headerContent = ` ${title}${modeIndicator} [Lines ${startLineNum}-${endLineNum} of ${totalLines}] `;
      const headerPad = Math.max(0, width - visibleLength(headerContent));
      output.push(`${ANSI.bgBlue}${ANSI.brightWhite}${headerContent}${" ".repeat(headerPad)}${ANSI.reset}`);

      // Content
      for (const line of visibleLines) {
        output.push(line);
      }

      // Pad remaining screen if needed
      for (let i = visibleLines.length; i < pageHeight; i++) {
        output.push("");
      }

      // Footer status bar
      const percent = totalLines > 0 ? Math.round((endLineNum / totalLines) * 100) : 100;
      const modeKeyPrompt = isMarkdown ? " | m: Toggle Diagram Mode" : "";
      const footerContent = ` (↑/↓: Scroll | Space/b: Page${modeKeyPrompt} | q/Esc: Back)  [${percent}%]`;
      const footerPad = Math.max(0, width - visibleLength(footerContent));
      output.push(`${ANSI.bgGray}${ANSI.white}${footerContent}${" ".repeat(footerPad)}${ANSI.reset}`);

      process.stdout.write(output.join("\n"));
    };

    const cleanup = () => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.removeListener("resize", onResize);
      process.stdout.write(ANSI.altScreenExit + ANSI.showCursor + "\n");
      resolvePromise();
    };

    const onResize = () => {
      render();
    };

    const onData = (chunk: Buffer) => {
      const key = chunk.toString();
      const height = process.stdout.rows || 24;
      const width = process.stdout.columns || 80;
      const pageHeight = Math.max(1, height - 2);
      const totalLines = getDisplayRows(width).length;

      if (key === "q" || key === "Q" || key === "\u0003" || key === "\u001b") {
        cleanup();
        return;
      }

      // Toggle diagram mode with 'm' or 'M'
      if ((key === "m" || key === "M") && isMarkdown) {
        diagramMode = diagramMode === "2d" ? "structured" : "2d";
        render();
        return;
      }

      // Arrow Down, j, or Enter
      if (key === "\u001b[B" || key === "j" || key === "\r" || key === "\n") {
        topRow = Math.min(totalLines - 1, topRow + 1);
        render();
      }
      // Arrow Up or k
      else if (key === "\u001b[A" || key === "k") {
        topRow = Math.max(0, topRow - 1);
        render();
      }
      // Page Down, Space, or Ctrl+D / d
      else if (key === "\u001b[6~" || key === " " || key === "\u0004" || key === "d") {
        topRow = Math.min(totalLines - pageHeight, topRow + pageHeight);
        render();
      }
      // Page Up, b, or Ctrl+U / u
      else if (key === "\u001b[5~" || key === "b" || key === "\u0015" || key === "u") {
        topRow = Math.max(0, topRow - pageHeight);
        render();
      }
      // Home, g, or standard top keys
      else if (key === "\u001b[H" || key === "g" || key === "\u001b[1~" || key === "\u001b[7~") {
        topRow = 0;
        render();
      }
      // End, G, or standard bottom keys
      else if (key === "\u001b[F" || key === "G" || key === "\u001b[4~" || key === "\u001b[8~") {
        topRow = Math.max(0, totalLines - pageHeight);
        render();
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write(ANSI.altScreenEnter + ANSI.hideCursor);
    process.stdin.on("data", onData);
    process.stdout.on("resize", onResize);

    render();
  });
}
