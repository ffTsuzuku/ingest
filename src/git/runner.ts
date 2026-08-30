import { stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { expandHome } from "../config/manager.js";
import { executeCommand, type CommandResult } from "../utils/command.js";

export { type CommandResult };

export async function runGit(args: string[], cwd: string): Promise<CommandResult> {
  return await executeCommand("git", args, { cwd });
}

export async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    const res = await runGit(["rev-parse", "--is-inside-work-tree"], dirPath);
    return res.exitCode === 0 && res.stdout === "true";
  } catch {
    return false;
  }
}

export async function getGitBranches(repoPath: string): Promise<string[]> {
  try {
    const res = await runGit(["branch", "--format=%(refname:short)"], repoPath);
    if (res.exitCode !== 0) return [];
    return res.stdout
      .split("\n")
      .map((b) => b.trim())
      .filter((b) => b.length > 0);
  } catch {
    return [];
  }
}

export async function getCurrentBranch(repoPath: string): Promise<string> {
  try {
    const res = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoPath);
    if (res.exitCode === 0 && res.stdout.length > 0) {
      return res.stdout;
    }
  } catch {
    // Fallback
  }
  return "main";
}

export async function resolveRepoPath(rawPath: string, basePath?: string): Promise<string> {
  const expanded = expandHome(rawPath);
  const target = isAbsolute(expanded) ? resolve(expanded) : resolve(basePath || process.cwd(), expanded);

  try {
    const fileStat = await stat(target);
    if (!fileStat.isDirectory()) {
      throw new Error(`Path is not a directory: ${target}`);
    }
  } catch (err: unknown) {
    throw new Error(`Repository path does not exist: ${target} (${String(err)})`);
  }

  const valid = await isGitRepo(target);
  if (!valid) {
    throw new Error(`Directory is not a valid Git repository: ${target}`);
  }

  return target;
}
