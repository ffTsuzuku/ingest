import * as readline from "node:readline";
import { ANSI, truncate } from "./ansi.js";

export interface SelectOption<T = string> {
  label: string;
  value: T;
  hint?: string;
}

export async function promptSelect<T = string>(options: {
  message: string;
  choices: SelectOption<T>[];
  defaultIndex?: number;
}): Promise<T | null> {
  const { message, choices, defaultIndex = 0 } = options;

  if (choices.length === 0) {
    return null;
  }

  if (!process.stdin.isTTY) {
    // Non-interactive fallback: return first option
    return choices[0]!.value;
  }

  return new Promise((resolvePromise) => {
    let selectedIndex = Math.max(0, Math.min(defaultIndex, choices.length - 1));
    let isRendered = false;

    const render = () => {
      const termWidth = Math.max(20, process.stdout.columns || 80);
      if (isRendered) {
        // Move up choices.length + 1 lines and reset cursor to start of line
        process.stdout.write(`\r\x1b[${choices.length + 1}A`);
      }
      isRendered = true;

      const titleLine = `${ANSI.bold}${ANSI.cyan}?${ANSI.reset} ${ANSI.bold}${message}${ANSI.reset}`;
      process.stdout.write(ANSI.clearLine + truncate(titleLine, termWidth - 1) + "\n");

      choices.forEach((choice, index) => {
        const isSelected = index === selectedIndex;
        const pointer = isSelected ? `${ANSI.brightCyan}❯${ANSI.reset}` : " ";
        const label = isSelected
          ? `${ANSI.bold}${ANSI.brightCyan}${choice.label}${ANSI.reset}`
          : `${ANSI.white}${choice.label}${ANSI.reset}`;
        const hint = choice.hint ? ` ${ANSI.gray}(${choice.hint})${ANSI.reset}` : "";

        const line = `  ${pointer} ${label}${hint}`;
        process.stdout.write(ANSI.clearLine + truncate(line, termWidth - 1) + "\n");
      });
    };

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write(ANSI.showCursor);
    };

    const onData = (chunk: Buffer) => {
      const key = chunk.toString();

      // Enter key
      if (key === "\r" || key === "\n") {
        cleanup();
        const termWidth = Math.max(20, process.stdout.columns || 80);
        const selected = choices[selectedIndex]!;
        const summary = `${ANSI.bold}${ANSI.green}✔${ANSI.reset} ${message} ${ANSI.cyan}${selected.label}${ANSI.reset}`;
        process.stdout.write(ANSI.clearLine + truncate(summary, termWidth - 1) + "\n");
        resolvePromise(selected.value);
        return;
      }

      // Ctrl+C
      if (key === "\u0003") {
        cleanup();
        process.exit(130);
      }

      // Standalone Escape key (Esc: \x1b, length 1)
      if (key === "\u001b" || (chunk.length === 1 && chunk[0] === 0x1b)) {
        cleanup();
        const termWidth = Math.max(20, process.stdout.columns || 80);
        const backSummary = `${ANSI.bold}${ANSI.gray}↩${ANSI.reset} ${ANSI.dim}${message} (Back)${ANSI.reset}`;
        process.stdout.write(ANSI.clearLine + truncate(backSummary, termWidth - 1) + "\n");
        resolvePromise(null);
        return;
      }

      // Up arrow or k
      if (key === "\u001b[A" || key === "k") {
        selectedIndex = (selectedIndex - 1 + choices.length) % choices.length;
        render();
      }
      // Down arrow or j
      else if (key === "\u001b[B" || key === "j") {
        selectedIndex = (selectedIndex + 1) % choices.length;
        render();
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write(ANSI.hideCursor);
    render();
    process.stdin.on("data", onData);
  });
}

export async function promptText(options: {
  message: string;
  defaultValue?: string;
  validate?: (val: string) => boolean | string;
}): Promise<string | null> {
  if (!process.stdin.isTTY) {
    return options.defaultValue || "";
  }

  return new Promise((resolvePromise) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const promptMsg = options.defaultValue
      ? `${ANSI.bold}${ANSI.cyan}?${ANSI.reset} ${ANSI.bold}${options.message}${ANSI.reset} ${ANSI.gray}(${options.defaultValue})${ANSI.reset} `
      : `${ANSI.bold}${ANSI.cyan}?${ANSI.reset} ${ANSI.bold}${options.message}${ANSI.reset} `;

    const onData = (chunk: Buffer) => {
      // Standalone Escape key
      if (chunk.length === 1 && chunk[0] === 0x1b) {
        cleanup();
        process.stdout.write(`\r${ANSI.clearLine}${ANSI.bold}${ANSI.gray}↩${ANSI.reset} ${ANSI.dim}${options.message} (Back)${ANSI.reset}\n`);
        resolvePromise(null);
      }
    };

    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      rl.close();
    };

    process.stdin.on("data", onData);

    rl.question(promptMsg, (answer) => {
      cleanup();
      const val = answer.trim() || options.defaultValue || "";
      resolvePromise(val);
    });
  });
}

export async function promptConfirm(options: {
  message: string;
  defaultYes?: boolean;
}): Promise<boolean> {
  const choices: SelectOption<boolean>[] = options.defaultYes
    ? [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ]
    : [
        { label: "No", value: false },
        { label: "Yes", value: true },
      ];

  const result = await promptSelect<boolean>({
    message: options.message,
    choices,
    defaultIndex: 0,
  });

  return result ?? false;
}
