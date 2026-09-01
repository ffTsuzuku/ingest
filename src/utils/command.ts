import { spawn } from "node:child_process";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CommandOptions {
  cwd?: string;
  input?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxBuffer?: number;
}

export async function executeCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let isTimedOut = false;
    let isMaxBufferExceeded = false;

    let timer: NodeJS.Timeout | undefined;
    if (options.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        isTimedOut = true;
        child.kill("SIGTERM");
      }, options.timeoutMs);
    }

    if (options.input) {
      child.stdin.write(options.input);
      child.stdin.end();
    } else {
      child.stdin.end();
    }

    child.stdout.on("data", (chunk) => {
      if (options.maxBuffer && stdout.length >= options.maxBuffer) return;
      stdout += String(chunk);
      if (options.maxBuffer && stdout.length > options.maxBuffer) {
        stdout = stdout.slice(0, options.maxBuffer);
        isMaxBufferExceeded = true;
        child.kill("SIGTERM");
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      rejectPromise(err);
    });

    child.on("close", (exitCode) => {
      if (timer) clearTimeout(timer);
      if (isTimedOut) {
        rejectPromise(new Error(`Command "${command}" timed out after ${options.timeoutMs}ms`));
        return;
      }
      resolvePromise({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: exitCode ?? 0,
      });
    });
  });
}
