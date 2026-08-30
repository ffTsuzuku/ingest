import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type LogLevel = "info" | "warn" | "error" | "debug";

export class Logger {
  private static logFilePath: string = "error.log";
  private static silentConsole: boolean = false;

  public static configure(options: { logFilePath?: string; silentConsole?: boolean }): void {
    if (options.logFilePath) {
      this.logFilePath = options.logFilePath;
    }
    if (options.silentConsole !== undefined) {
      this.silentConsole = options.silentConsole;
    }
  }

  public static async error(message: string, error?: unknown): Promise<void> {
    const timestamp = new Date().toISOString();
    const errorDetails = error instanceof Error ? `\nStack: ${error.stack}` : error ? `\nDetails: ${String(error)}` : "";
    const logLine = `[${timestamp}] [ERROR] ${message}${errorDetails}\n`;

    if (!this.silentConsole) {
      console.error(`\x1b[31m✖ Error: ${message}\x1b[0m`);
      if (process.env.DEBUG && error instanceof Error && error.stack) {
        console.error(`\x1b[90m${error.stack}\x1b[0m`);
      }
    }

    try {
      await mkdir(dirname(this.logFilePath), { recursive: true });
      await appendFile(this.logFilePath, logLine, "utf8");
    } catch {
      // Ignore fallback write errors
    }
  }

  public static info(message: string): void {
    if (!this.silentConsole) {
      console.log(`\x1b[36mℹ\x1b[0m ${message}`);
    }
  }

  public static success(message: string): void {
    if (!this.silentConsole) {
      console.log(`\x1b[32m✔\x1b[0m ${message}`);
    }
  }

  public static warn(message: string): void {
    if (!this.silentConsole) {
      console.warn(`\x1b[33m⚠\x1b[0m ${message}`);
    }
  }
}
