import * as readline from "node:readline";
import { ANSI } from "./ansi.js";

export interface SelectOption<T = string> {
  label: string;
  value: T;
  hint?: string;
}

export async function promptSelect<T = string>(options: {
  message: string;
  choices: SelectOption<T>[];
  defaultIndex?: number;
}): Promise<T> {
  const { message, choices, defaultIndex = 0 } = options;

  if (!process.stdin.isTTY) {
    // Non-interactive fallback: return first option
    return choices[0]!.value;
  }

  return new Promise((resolvePromise) => {
    let selectedIndex = Math.max(0, Math.min(defaultIndex, choices.length - 1));
    let isRendered = false;

    const render = () => {
      if (isRendered) {
        // Move up choices.length + 1 lines
        process.stdout.write(`\x1b[${choices.length + 1}A`);
      }
      isRendered = true;

      process.stdout.write(ANSI.clearLine + `${ANSI.bold}${ANSI.cyan}?${ANSI.reset} ${ANSI.bold}${message}${ANSI.reset}\n`);

      choices.forEach((choice, index) => {
        const isSelected = index === selectedIndex;
        const pointer = isSelected ? `${ANSI.brightCyan}❯${ANSI.reset}` : " ";
        const label = isSelected
          ? `${ANSI.bold}${ANSI.brightCyan}${choice.label}${ANSI.reset}`
          : `${ANSI.white}${choice.label}${ANSI.reset}`;
        const hint = choice.hint ? ` ${ANSI.gray}(${choice.hint})${ANSI.reset}` : "";

        process.stdout.write(ANSI.clearLine + `  ${pointer} ${label}${hint}\n`);
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
        const selected = choices[selectedIndex]!;
        process.stdout.write(ANSI.clearLine + `${ANSI.bold}${ANSI.green}✔${ANSI.reset} ${message} ${ANSI.cyan}${selected.label}${ANSI.reset}\n`);
        resolvePromise(selected.value);
        return;
      }

      // Ctrl+C
      if (key === "\u0003") {
        cleanup();
        process.exit(130);
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
}): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptMsg = options.defaultValue
    ? `${ANSI.bold}${ANSI.cyan}?${ANSI.reset} ${ANSI.bold}${options.message}${ANSI.reset} ${ANSI.gray}(${options.defaultValue})${ANSI.reset} `
    : `${ANSI.bold}${ANSI.cyan}?${ANSI.reset} ${ANSI.bold}${options.message}${ANSI.reset} `;

  return new Promise((resolvePromise) => {
    rl.question(promptMsg, (answer) => {
      rl.close();
      const val = answer.trim() || options.defaultValue || "";
      resolvePromise(val);
    });
  });
}

export async function promptConfirm(options: {
  message: string;
  defaultYes?: boolean;
}): Promise<boolean> {
  const defaultHint = options.defaultYes ? "[Y/n]" : "[y/N]";
  const text = await promptText({
    message: `${options.message} ${ANSI.gray}${defaultHint}${ANSI.reset}`,
  });

  if (!text) {
    return options.defaultYes ?? false;
  }
  return text.toLowerCase().startsWith("y");
}
