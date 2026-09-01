export { getCommitsBetweenRefs, parseCompareRange } from "./log.js";
import { stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { expandHome } from "../config/manager.js";
import { executeCommand, type CommandResult } from "../utils/command.js";

export { type CommandResult };

export async function runGit(
  args: string[],
  cwd: string,
  options?: { timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<CommandResult> {
  try {
    return await executeCommand("git", args, { cwd, timeoutMs: options?.timeoutMs, env: options?.env });
  } catch (err: unknown) {
    return {
      stdout: "",
      stderr: String(err),
      exitCode: 1,
    };
  }
}

/**
 * Check if a Git reference (branch, tag, remote ref, or commit) exists and resolves to a valid object.
 */
export async function refExists(ref: string, repoPath: string): Promise<boolean> {
  try {
    const res = await runGit(["rev-parse", "--verify", "--quiet", ref], repoPath);
    return res.exitCode === 0 && res.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Attempt to fetch latest refs from origin (or configured remote) with a timeout.
 * Gracefully falls back (returns false) if offline, remote doesn't exist, or auth fails.
 */
export async function fetchRemoteOrigin(repoPath: string, timeoutMs: number = 8000): Promise<boolean> {
  try {
    const remoteRes = await runGit(["remote"], repoPath, { timeoutMs: 3000 });
    if (remoteRes.exitCode !== 0 || !remoteRes.stdout.trim()) {
      return false;
    }

    const remotes = remoteRes.stdout.split("\n").map((r) => r.trim()).filter(Boolean);
    const targetRemote = remotes.includes("origin") ? "origin" : remotes[0];
    if (!targetRemote) {
      return false;
    }

    const fetchRes = await runGit(["fetch", targetRemote, "--prune", "--quiet"], repoPath, { timeoutMs });
    return fetchRes.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Resolve target refs to query for a given branch name, including origin/<branch> if available.
 */
export async function resolveBranchTargetRefs(repoPath: string, branch: string): Promise<string[]> {
  if (!branch || branch.includes("..") || branch.includes("...")) {
    return [branch || "HEAD"];
  }

  if (branch.startsWith("origin/") || branch.startsWith("refs/")) {
    return [branch];
  }

  const localExists = await refExists(branch, repoPath);
  const remoteRef = `origin/${branch}`;
  const remoteExists = await refExists(remoteRef, repoPath);

  const refs: string[] = [];
  if (localExists) refs.push(branch);
  if (remoteExists && !refs.includes(remoteRef)) refs.push(remoteRef);

  return refs.length > 0 ? refs : [branch];
}

/**
 * Resolve a single Git reference (e.g. for compare ranges), falling back to origin/<ref> if local doesn't exist.
 */
export async function resolveSingleRef(repoPath: string, ref: string): Promise<string> {
  if (
    !ref ||
    ref.includes("..") ||
    ref.startsWith("origin/") ||
    ref.startsWith("refs/") ||
    ref.includes("~") ||
    ref.includes("^")
  ) {
    return ref;
  }
  const localExists = await refExists(ref, repoPath);
  if (localExists) return ref;
  const remoteRef = `origin/${ref}`;
  const remoteExists = await refExists(remoteRef, repoPath);
  if (remoteExists) return remoteRef;
  return ref;
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

export async function getAllGitBranches(repoPath: string): Promise<string[]> {
  try {
    const res = await runGit(["branch", "-a", "--format=%(refname:short)"], repoPath);
    if (res.exitCode !== 0) return await getGitBranches(repoPath);

    const set = new Set<string>();
    for (const raw of res.stdout.split("\n")) {
      const b = raw.trim();
      if (!b || b.includes("/HEAD") || b === "HEAD") continue;
      const clean = b.startsWith("origin/") ? b.slice(7) : b;
      if (clean && !clean.includes("HEAD")) {
        set.add(clean);
      }
    }

    const current = await getCurrentBranch(repoPath);
    const list = Array.from(set);
    return list.sort((a, b) => {
      if (a === current) return -1;
      if (b === current) return 1;
      if (a === "main" || a === "master") return -1;
      if (b === "main" || b === "master") return 1;
      return a.localeCompare(b);
    });
  } catch {
    return await getGitBranches(repoPath);
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

