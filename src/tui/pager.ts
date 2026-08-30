import { ANSI } from "./ansi.js";

export async function showTerminalPager(lines: string[], title = "Report Viewer"): Promise<void> {
  if (!process.stdin.isTTY) {
    // Non-interactive fallback: just print the lines
    console.log(lines.join("\n"));
    return;
  }

  return new Promise((resolvePromise) => {
    let topRow = 0;
    const totalLines = lines.length;

    const render = () => {
      const height = process.stdout.rows || 24;
      const width = process.stdout.columns || 80;
      const pageHeight = Math.max(1, height - 3);

      const maxTop = Math.max(0, totalLines - pageHeight);
      topRow = Math.min(topRow, maxTop);
      topRow = Math.max(0, topRow);

      const visibleLines = lines.slice(topRow, topRow + pageHeight);
      const output: string[] = [ANSI.clearScreen];

      // Header bar
      const headerText = ` ${title} [Lines ${topRow + 1}-${Math.min(topRow + pageHeight, totalLines)} of ${totalLines}] `;
      output.push(`${ANSI.bgBlue}${ANSI.brightWhite}${headerText.padEnd(width)}${ANSI.reset}`);

      // Content
      for (const line of visibleLines) {
        output.push(line);
      }

      // Pad remaining screen if needed
      for (let i = visibleLines.length; i < pageHeight; i++) {
        output.push("");
      }

      // Footer status bar
      const percent = totalLines > 0 ? Math.round((Math.min(topRow + pageHeight, totalLines) / totalLines) * 100) : 100;
      const footerText = ` (↑/↓ or j/k: Scroll | PgUp/PgDn: Jump | q: Exit)  [${percent}%]`;
      output.push(`${ANSI.bgGray}${ANSI.white}${footerText.padEnd(width)}${ANSI.reset}`);

      process.stdout.write(output.join("\n"));
    };

    const cleanup = () => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.removeListener("resize", onResize);
      process.stdout.write(ANSI.showCursor + "\n");
      resolvePromise();
    };

    const onResize = () => {
      render();
    };

    const onData = (chunk: Buffer) => {
      const key = chunk.toString();
      const height = process.stdout.rows || 24;
      const pageHeight = Math.max(1, height - 3);

      if (key === "q" || key === "Q" || key === "\u0003" || key === "\u001b") {
        cleanup();
        return;
      }

      // Arrow Down or j
      if (key === "\u001b[B" || key === "j") {
        topRow = Math.min(totalLines - 1, topRow + 1);
        render();
      }
      // Arrow Up or k
      else if (key === "\u001b[A" || key === "k") {
        topRow = Math.max(0, topRow - 1);
        render();
      }
      // Page Down or Space
      else if (key === "\u001b[6~" || key === " ") {
        topRow = Math.min(totalLines - pageHeight, topRow + pageHeight);
        render();
      }
      // Page Up or b
      else if (key === "\u001b[5~" || key === "b") {
        topRow = Math.max(0, topRow - pageHeight);
        render();
      }
      // Home or g
      else if (key === "\u001b[H" || key === "g") {
        topRow = 0;
        render();
      }
      // End or G
      else if (key === "\u001b[F" || key === "G") {
        topRow = Math.max(0, totalLines - pageHeight);
        render();
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write(ANSI.hideCursor);
    process.stdin.on("data", onData);
    process.stdout.on("resize", onResize);

    render();
  });
}
