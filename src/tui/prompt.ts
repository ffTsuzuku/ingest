import { readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { homedir } from "node:os";
import * as readline from "node:readline";
import { ANSI, truncate } from "./ansi.js";

export interface SelectOption<T = string> {
  label: string;
  value: T;
  hint?: string;
}

export interface PathCompleterOptions {
  directoriesOnly?: boolean;
}

export function createPathCompleter(options: PathCompleterOptions = {}): readline.Completer {
  return function pathCompleter(line: string): [string[], string] {
    const raw = line.trim();

    if (raw === "~") {
      return [["~/"], "~"];
    }

    let expanded = raw;
    if (raw.startsWith("~" + sep) || raw.startsWith("~/")) {
      expanded = join(homedir(), raw.slice(2));
    } else if (raw === "~") {
      expanded = homedir();
    }

    let searchDir: string;
    let partial: string;

    if (raw.endsWith("/") || raw.endsWith(sep)) {
      searchDir = expanded;
      partial = "";
    } else {
      const lastSlashIndex = Math.max(raw.lastIndexOf("/"), raw.lastIndexOf("\\"));
      if (lastSlashIndex >= 0) {
        const dirPart = expanded.slice(0, expanded.lastIndexOf(sep) + 1);
        searchDir = dirPart || (sep === "\\" ? "C:\\" : "/");
        partial = raw.slice(lastSlashIndex + 1);
      } else {
        searchDir = process.cwd();
        partial = raw;
      }
    }

    try {
      const entries = readdirSync(searchDir || ".", { withFileTypes: true });
      const hits: string[] = [];

      for (const entry of entries) {
        // Skip hidden files unless user started typing with a dot
        if (!partial.startsWith(".") && entry.name.startsWith(".")) {
          continue;
        }

        if (entry.name.startsWith(partial)) {
          let isDir = entry.isDirectory();
          if (!isDir && entry.isSymbolicLink()) {
            try {
              const fullPath = join(searchDir || ".", entry.name);
              isDir = statSync(fullPath).isDirectory();
            } catch {
              isDir = false;
            }
          }

          if (options.directoriesOnly && !isDir) {
            continue;
          }

          let name = entry.name;
          if (isDir) {
            name += "/";
          }
          hits.push(name);
        }
      }

      hits.sort((a, b) => a.localeCompare(b));
      return [hits, partial];
    } catch {
      return [[], partial];
    }
  };
}

export const pathCompleter: readline.Completer = createPathCompleter();

export interface PromptTextOptions {
  message: string;
  defaultValue?: string;
  validate?: (val: string) => boolean | string;
  completer?: readline.Completer | "path" | "dir";
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

export async function promptText(options: PromptTextOptions): Promise<string | null> {
  if (!process.stdin.isTTY) {
    return options.defaultValue || "";
  }

  return new Promise((resolvePromise) => {
    let resolvedCompleter: readline.Completer | undefined;
    if (typeof options.completer === "function") {
      resolvedCompleter = options.completer;
    } else if (options.completer === "dir") {
      resolvedCompleter = createPathCompleter({ directoriesOnly: true });
    } else if (options.completer === "path") {
      resolvedCompleter = pathCompleter;
    }

    process.stdin.resume();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: resolvedCompleter,
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

export interface MultiSelectOption<T = string> {
  label: string;
  value: T;
  hint?: string;
  selected?: boolean;
}

export interface PromptMultiSelectOptions<T = string> {
  message: string;
  choices: MultiSelectOption<T>[];
  pageSize?: number;
  allowCustomInput?: boolean;
}

export async function promptMultiSelect<T = string>(options: PromptMultiSelectOptions<T>): Promise<T[] | null> {
  const { message, choices, pageSize = 8, allowCustomInput = true } = options;

  if (choices.length === 0 && !allowCustomInput) {
    return [];
  }

  if (!process.stdin.isTTY) {
    // Non-interactive fallback
    const selected = choices.filter((c) => c.selected).map((c) => c.value);
    return selected.length > 0 ? selected : choices.length > 0 ? [choices[0]!.value] : [];
  }

  return new Promise((resolvePromise) => {
    // Clone choices into a mutable internal array
    const allItems: Array<{ label: string; value: T; hint?: string; selected: boolean; isCustom?: boolean }> =
      choices.map((c) => ({
        label: c.label,
        value: c.value,
        hint: c.hint,
        selected: c.selected ?? false,
      }));

    let filterText = "";
    let selectedIndex = 0;
    let lastRenderedLineCount = 0;

    const getFilteredItems = () => {
      const lower = filterText.toLowerCase().trim();
      const matched = lower.length === 0
        ? allItems.slice()
        : allItems.filter(
            (item) =>
              item.label.toLowerCase().includes(lower) ||
              String(item.value).toLowerCase().includes(lower) ||
              (item.hint && item.hint.toLowerCase().includes(lower)),
          );

      // If allowCustomInput and user typed something not matching any existing item exactly, offer to add it
      if (allowCustomInput && lower.length > 0) {
        const exactMatch = allItems.some((i) => i.label.toLowerCase() === lower || String(i.value).toLowerCase() === lower);
        if (!exactMatch) {
          matched.push({
            label: `➕ Add "${filterText}"`,
            value: filterText as unknown as T,
            hint: "custom branch",
            selected: false,
            isCustom: true,
          });
        }
      }

      return matched;
    };

    const render = () => {
      const termWidth = Math.max(20, process.stdout.columns || 80);
      const filtered = getFilteredItems();

      // Clamp selectedIndex
      if (filtered.length === 0) {
        selectedIndex = 0;
      } else if (selectedIndex >= filtered.length) {
        selectedIndex = filtered.length - 1;
      } else if (selectedIndex < 0) {
        selectedIndex = 0;
      }

      // Calculate scroll window
      const total = filtered.length;
      let startIndex = 0;
      let endIndex = Math.min(pageSize, total);

      if (selectedIndex >= endIndex) {
        endIndex = selectedIndex + 1;
        startIndex = Math.max(0, endIndex - pageSize);
      } else if (selectedIndex < startIndex) {
        startIndex = selectedIndex;
        endIndex = Math.min(total, startIndex + pageSize);
      }

      const visibleItems = filtered.slice(startIndex, endIndex);

      // Erase previously rendered lines
      if (lastRenderedLineCount > 0) {
        process.stdout.write(`\r\x1b[${lastRenderedLineCount}A`);
      }

      const lines: string[] = [];

      // 1. Title line
      const title = `${ANSI.bold}${ANSI.cyan}?${ANSI.reset} ${ANSI.bold}${message}${ANSI.reset} ${ANSI.dim}(<space> to toggle, <enter> to confirm)${ANSI.reset}`;
      lines.push(ANSI.clearLine + truncate(title, termWidth - 1));

      // 2. Search Filter line
      const searchDisplay = filterText.length > 0
        ? `${ANSI.yellow}${filterText}${ANSI.reset}`
        : `${ANSI.dim}type to search...${ANSI.reset}`;
      lines.push(ANSI.clearLine + `  ${ANSI.bold}Search:${ANSI.reset} ${searchDisplay}`);

      // 3. Top scroll indicator
      if (startIndex > 0) {
        lines.push(ANSI.clearLine + `  ${ANSI.dim}▲ ${startIndex} more above...${ANSI.reset}`);
      }

      // 4. Visible items
      if (filtered.length === 0) {
        lines.push(ANSI.clearLine + `  ${ANSI.gray}No matching branches found${ANSI.reset}`);
      } else {
        visibleItems.forEach((item, idx) => {
          const globalIdx = startIndex + idx;
          const isCursor = globalIdx === selectedIndex;
          const pointer = isCursor ? `${ANSI.brightCyan}❯${ANSI.reset}` : " ";
          const checkbox = item.selected
            ? `${ANSI.bold}${ANSI.green}[✔]${ANSI.reset}`
            : `${ANSI.gray}[ ]${ANSI.reset}`;

          const label = isCursor
            ? `${ANSI.bold}${ANSI.brightCyan}${item.label}${ANSI.reset}`
            : item.selected
              ? `${ANSI.bold}${item.label}${ANSI.reset}`
              : `${ANSI.white}${item.label}${ANSI.reset}`;

          const hint = item.hint ? ` ${ANSI.gray}(${item.hint})${ANSI.reset}` : "";
          lines.push(ANSI.clearLine + `  ${pointer} ${checkbox} ${label}${hint}`);
        });
      }

      // 5. Bottom scroll indicator
      if (endIndex < total) {
        lines.push(ANSI.clearLine + `  ${ANSI.dim}▼ ${total - endIndex} more below...${ANSI.reset}`);
      }

      // 6. Selected counter footer
      const selectedTotal = allItems.filter((i) => i.selected).length;
      const countDisplay = `${ANSI.dim}(${selectedTotal} selected)${ANSI.reset}`;
      lines.push(ANSI.clearLine + `  ${countDisplay}`);

      lastRenderedLineCount = lines.length;
      process.stdout.write(lines.join("\n") + "\n");
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
        const selected = allItems.filter((i) => i.selected).map((i) => i.value);
        // If nothing explicitly selected, but user is on an item, select that item
        const filtered = getFilteredItems();
        let finalValues = selected;
        if (finalValues.length === 0 && filtered.length > 0) {
          const current = filtered[selectedIndex];
          if (current) {
            finalValues = [current.value];
          }
        }

        const termWidth = Math.max(20, process.stdout.columns || 80);
        const summary = `${ANSI.bold}${ANSI.green}✔${ANSI.reset} ${message} ${ANSI.cyan}[${finalValues.join(", ")}]${ANSI.reset}`;
        process.stdout.write(ANSI.clearLine + truncate(summary, termWidth - 1) + "\n");
        resolvePromise(finalValues);
        return;
      }

      // Ctrl+C
      if (key === "\u0003") {
        cleanup();
        process.exit(130);
      }

      // Standalone Escape
      if (key === "\u001b" || (chunk.length === 1 && chunk[0] === 0x1b)) {
        cleanup();
        const termWidth = Math.max(20, process.stdout.columns || 80);
        const backSummary = `${ANSI.bold}${ANSI.gray}↩${ANSI.reset} ${ANSI.dim}${message} (Cancelled)${ANSI.reset}`;
        process.stdout.write(ANSI.clearLine + truncate(backSummary, termWidth - 1) + "\n");
        resolvePromise(null);
        return;
      }

      // Up arrow or Ctrl+P
      if (key === "\u001b[A" || key === "\u001bOA" || key === "\u0010") {
        const filtered = getFilteredItems();
        if (filtered.length > 0) {
          selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length;
          render();
        }
        return;
      }

      // Down arrow or Ctrl+N
      if (key === "\u001b[B" || key === "\u001bOB" || key === "\u000e") {
        const filtered = getFilteredItems();
        if (filtered.length > 0) {
          selectedIndex = (selectedIndex + 1) % filtered.length;
          render();
        }
        return;
      }

      // Space key: Toggle checkbox
      if (key === " " || (chunk.length === 1 && chunk[0] === 32)) {
        const filtered = getFilteredItems();
        const current = filtered[selectedIndex];
        if (current) {
          if (current.isCustom) {
            // Add custom item to allItems and select it
            const newItem = {
              label: String(current.value),
              value: current.value,
              selected: true,
            };
            allItems.push(newItem);
            filterText = "";
            selectedIndex = allItems.length - 1;
          } else {
            current.selected = !current.selected;
            // Also find and update in allItems
            const original = allItems.find((i) => i.value === current.value);
            if (original) original.selected = current.selected;
          }
          render();
        }
        return;
      }

      // Backspace: Delete from search filter
      if (chunk.length === 1 && (chunk[0] === 0x7f || chunk[0] === 0x08)) {
        if (filterText.length > 0) {
          filterText = filterText.slice(0, -1);
          selectedIndex = 0;
          render();
        }
        return;
      }

      // Ctrl+A (Toggle all visible items)
      if (chunk.length === 1 && chunk[0] === 0x01) {
        const filtered = getFilteredItems();
        const allSelected = filtered.every((i) => i.selected);
        for (const item of filtered) {
          if (!item.isCustom) {
            item.selected = !allSelected;
            const original = allItems.find((i) => i.value === item.value);
            if (original) original.selected = item.selected;
          }
        }
        render();
        return;
      }

      // Printable character typing (for real-time filter search)
      if (chunk.length === 1 && chunk[0]! >= 33 && chunk[0]! <= 126) {
        filterText += chunk.toString();
        selectedIndex = 0;
        render();
        return;
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write(ANSI.hideCursor);
    render();
    process.stdin.on("data", onData);
  });
}

