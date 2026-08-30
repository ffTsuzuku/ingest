import { stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
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

/**
 * Extract repository name from a Git remote URL (HTTPS, SSH, SCP-like, or file path).
 */
export function extractRepoNameFromUrl(remoteUrl: string): string | null {
  const cleaned = remoteUrl.trim().replace(/\.git\/?$/, "");
  if (!cleaned) return null;
  const parts = cleaned.split(/[/:\\]+/).filter(Boolean);
  if (parts.length > 0) {
    const last = parts[parts.length - 1];
    if (last && last !== "." && last !== "..") {
      return last;
    }
  }
  return null;
}

/**
 * Infer the repository name from user config, Git remote origin URL, Git worktree structure,
 * or directory structure (avoiding generic branch names like 'main' or 'master').
 */
export async function getRepoName(repoPath: string, configuredRepoName?: string | null): Promise<string> {
  if (configuredRepoName && configuredRepoName.trim().length > 0) {
    return configuredRepoName.trim();
  }

  // 1. Try remote origin URL
  try {
    const res = await runGit(["remote", "get-url", "origin"], repoPath);
    if (res.exitCode === 0 && res.stdout.trim()) {
      const extracted = extractRepoNameFromUrl(res.stdout);
      if (extracted) return extracted;
    }
  } catch {
    // Ignore and fall through
  }

  // 2. Try first available git remote
  try {
    const res = await runGit(["remote"], repoPath);
    if (res.exitCode === 0 && res.stdout.trim()) {
      const firstRemote = res.stdout.trim().split("\n")[0]?.trim();
      if (firstRemote) {
        const urlRes = await runGit(["remote", "get-url", firstRemote], repoPath);
        if (urlRes.exitCode === 0 && urlRes.stdout.trim()) {
          const extracted = extractRepoNameFromUrl(urlRes.stdout);
          if (extracted) return extracted;
        }
      }
    }
  } catch {
    // Ignore and fall through
  }

  // 3. Try git-common-dir (handles git worktrees and bare repo layouts)
  try {
    const commonRes = await runGit(["rev-parse", "--git-common-dir"], repoPath);
    if (commonRes.exitCode === 0 && commonRes.stdout.trim()) {
      const commonDir = commonRes.stdout.trim();
      const parentDir = dirname(commonDir);
      const parentBase = basename(parentDir);
      if (parentBase && parentBase !== "." && parentBase !== "/" && !parentBase.startsWith(".")) {
        return parentBase;
      }
    }
  } catch {
    // Ignore and fall through
  }

  // 4. Fallback to folder name, checking parent if folder name is a common branch / worktree name
  const dirName = basename(repoPath);
  const genericNames = new Set(["main", "master", "trunk", "develop", "dev", "head", "workspace", "worktree"]);
  if (genericNames.has(dirName.toLowerCase())) {
    const parentDirName = basename(dirname(repoPath));
    if (parentDirName && parentDirName !== "." && parentDirName !== "/") {
      return parentDirName;
    }
  }

  return dirName || "repository";
}

