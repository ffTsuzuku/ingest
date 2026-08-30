export const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  inverse: "\x1b[7m",
  hidden: "\x1b[8m",
  strikethrough: "\x1b[9m",

  // Foreground
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",

  // Bright Foreground
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",

  // Background
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
  bgGray: "\x1b[100m",

  // Cursor & Screen
  clearScreen: "\x1b[2J\x1b[H",
  clearLine: "\x1b[2K\r",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  altScreenEnter: "\x1b[?1049h",
  altScreenExit: "\x1b[?1049l",
};

export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

export function truncate(text: string, maxWidth: number): string {
  const plain = stripAnsi(text);
  if (plain.length <= maxWidth) return text;
  return plain.slice(0, maxWidth - 1) + "…";
}

export function drawBox(title: string, contentLines: string[], width = 70): string[] {
  const horizontal = "─".repeat(width - 2);
  const titleFormatted = title ? ` ${ANSI.bold}${title}${ANSI.reset} ` : "";
  const titleLen = stripAnsi(titleFormatted).length;
  const topBar = `┌${titleFormatted}${"─".repeat(Math.max(0, width - 2 - titleLen))}┐`;
  const bottomBar = `└${horizontal}┘`;

  const renderedLines = contentLines.map((line) => {
    const plain = stripAnsi(line);
    const padding = Math.max(0, width - 4 - plain.length);
    return `│ ${line}${" ".repeat(padding)} │`;
  });

  return [topBar, ...renderedLines, bottomBar];
}
