import { runGit } from "./runner.js";
import { buildGitDateArgs } from "./log.js";
import type { DateFilter, DiffStat } from "./types.js";

const NOISY_FILE_PATTERNS = [
  /package-lock\.json$/i,
  /pnpm-lock\.yaml$/i,
  /yarn\.lock$/i,
  /\.min\.(js|css)$/i,
  /\.(png|jpe?g|gif|svg|ico|webp|avif|woff2?|eot|ttf|otf|wasm|pdf|zip|gz|tar)$/i,
  /\.map$/i,
];

function isNoisyFile(filePath: string): boolean {
  return NOISY_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

export async function fetchDiffPatches(
  repoPath: string,
  branches: string[],
  filter: DateFilter = {},
  maxPatchLines = 300,
): Promise<string> {
  const dateArgs = buildGitDateArgs(filter);
  const targetBranch = branches[0] || "HEAD";

  // Run git log with unified patch diffs (-p) and 2 lines of context (-U2)
  const res = await runGit(["log", targetBranch, ...dateArgs, "-p", "-U2", "--no-color"], repoPath);
  if (res.exitCode !== 0 || !res.stdout) {
    return "";
  }

  const rawLines = res.stdout.split("\n");
  const filteredLines: string[] = [];
  let skippingCurrentFile = false;
  let currentFileCount = 0;

  for (const line of rawLines) {
    if (filteredLines.length >= maxPatchLines) {
      filteredLines.push("\n... [Diff patches truncated for brevity] ...");
      break;
    }

    // Check file header in diff output: "diff --git a/... b/..."
    const diffHeaderMatch = line.match(/^diff --git a\/(.+) b\/(.+)/);
    if (diffHeaderMatch) {
      const filePath = diffHeaderMatch[2] || diffHeaderMatch[1] || "";
      if (isNoisyFile(filePath)) {
        skippingCurrentFile = true;
      } else {
        skippingCurrentFile = false;
        currentFileCount++;
      }
    }

    if (skippingCurrentFile) {
      continue;
    }

    // Skip index and mode lines to save token budget
    if (line.startsWith("index ") || line.startsWith("old mode ") || line.startsWith("new mode ")) {
      continue;
    }

    filteredLines.push(line);
  }

  return filteredLines.join("\n");
}

export async function fetchDiffStat(
  repoPath: string,
  branches: string[],
  filter: DateFilter = {},
  maxLines = 200,
): Promise<DiffStat | undefined> {
  const dateArgs = buildGitDateArgs(filter);
  const targetBranch = branches[0] || "HEAD";

  // Run git log with diffstat
  const res = await runGit(["log", targetBranch, ...dateArgs, "--stat"], repoPath);
  if (res.exitCode !== 0 || !res.stdout) {
    return undefined;
  }

  const lines = res.stdout.split("\n");
  const fileStats: Array<{ path: string; insertions: number; deletions: number }> = [];
  let totalFiles = 0;
  let totalInsertions = 0;
  let totalDeletions = 0;

  for (const line of lines) {
    // Matches standard git diffstat: " src/file.ts | 15 +++--- " or " 3 files changed, 20 insertions(+), 5 deletions(-)"
    const summaryMatch = line.match(/(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/i);
    if (summaryMatch) {
      totalFiles += parseInt(summaryMatch[1] || "0", 10);
      totalInsertions += parseInt(summaryMatch[2] || "0", 10);
      totalDeletions += parseInt(summaryMatch[3] || "0", 10);
      continue;
    }

    const fileMatch = line.match(/^\s*(.+?)\s*\|\s*(\d+)\s*([\+\-]*)/);
    if (fileMatch) {
      const path = (fileMatch[1] ?? "").trim();
      const count = parseInt(fileMatch[2] ?? "0", 10);
      const symbols = fileMatch[3] ?? "";
      const plusCount = (symbols.match(/\+/g) || []).length;
      const minusCount = (symbols.match(/\-/g) || []).length;
      const totalSymbols = plusCount + minusCount || 1;

      const ins = Math.round((plusCount / totalSymbols) * count);
      const del = count - ins;

      fileStats.push({ path, insertions: ins, deletions: del });
    }
  }

  const truncatedSummary = lines.slice(0, maxLines).join("\n");
  const diffPatches = await fetchDiffPatches(repoPath, branches, filter, maxLines * 2);

  return {
    filesChangedCount: totalFiles || fileStats.length,
    insertions: totalInsertions,
    deletions: totalDeletions,
    fileStats: fileStats.slice(0, 30),
    diffSummary: truncatedSummary,
    diffPatches: diffPatches || undefined,
  };
}

/**
 * Fetch unified patch diffs between two arbitrary Git references (e.g. base..target or base...target).
 */
export async function fetchDiffPatchesBetweenRefs(
  repoPath: string,
  baseRef: string,
  targetRef?: string,
  maxPatchLines = 300,
): Promise<string> {
  const range = targetRef && !baseRef.includes("..") ? `${baseRef}..${targetRef}` : baseRef;

  const res = await runGit(["diff", range, "-p", "-U2", "--no-color"], repoPath);
  if (res.exitCode !== 0 || !res.stdout) {
    return "";
  }

  const rawLines = res.stdout.split("\n");
  const filteredLines: string[] = [];
  let skippingCurrentFile = false;

  for (const line of rawLines) {
    if (filteredLines.length >= maxPatchLines) {
      filteredLines.push("\n... [Diff patches truncated for brevity] ...");
      break;
    }

    const diffHeaderMatch = line.match(/^diff --git a\/(.+) b\/(.+)/);
    if (diffHeaderMatch) {
      const filePath = diffHeaderMatch[2] || diffHeaderMatch[1] || "";
      if (isNoisyFile(filePath)) {
        skippingCurrentFile = true;
      } else {
        skippingCurrentFile = false;
      }
    }

    if (skippingCurrentFile) {
      continue;
    }

    if (line.startsWith("index ") || line.startsWith("old mode ") || line.startsWith("new mode ")) {
      continue;
    }

    filteredLines.push(line);
  }

  return filteredLines.join("\n");
}

/**
 * Fetch diff statistics and patch excerpts between two arbitrary Git references (e.g. base..target or base...target).
 */
export async function fetchDiffStatBetweenRefs(
  repoPath: string,
  baseRef: string,
  targetRef?: string,
  maxLines = 200,
): Promise<DiffStat | undefined> {
  const range = targetRef && !baseRef.includes("..") ? `${baseRef}..${targetRef}` : baseRef;

  const res = await runGit(["diff", range, "--stat"], repoPath);
  if (res.exitCode !== 0) {
    return undefined;
  }

  if (!res.stdout || !res.stdout.trim()) {
    return {
      filesChangedCount: 0,
      insertions: 0,
      deletions: 0,
      fileStats: [],
      diffSummary: "",
      diffPatches: undefined,
    };
  }

  const lines = res.stdout.split("\n");
  const fileStats: Array<{ path: string; insertions: number; deletions: number }> = [];
  let totalFiles = 0;
  let totalInsertions = 0;
  let totalDeletions = 0;

  for (const line of lines) {
    const summaryMatch = line.match(/(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/i);
    if (summaryMatch) {
      totalFiles += parseInt(summaryMatch[1] || "0", 10);
      totalInsertions += parseInt(summaryMatch[2] || "0", 10);
      totalDeletions += parseInt(summaryMatch[3] || "0", 10);
      continue;
    }

    const fileMatch = line.match(/^\s*(.+?)\s*\|\s*(\d+)\s*([\+\-]*)/);
    if (fileMatch) {
      const path = (fileMatch[1] ?? "").trim();
      const count = parseInt(fileMatch[2] ?? "0", 10);
      const symbols = fileMatch[3] ?? "";
      const plusCount = (symbols.match(/\+/g) || []).length;
      const minusCount = (symbols.match(/\-/g) || []).length;
      const totalSymbols = plusCount + minusCount || 1;

      const ins = Math.round((plusCount / totalSymbols) * count);
      const del = count - ins;

      fileStats.push({ path, insertions: ins, deletions: del });
    }
  }

  const truncatedSummary = lines.slice(0, maxLines).join("\n");
  const diffPatches = await fetchDiffPatchesBetweenRefs(repoPath, baseRef, targetRef, maxLines * 2);

  return {
    filesChangedCount: totalFiles || fileStats.length,
    insertions: totalInsertions,
    deletions: totalDeletions,
    fileStats: fileStats.slice(0, 30),
    diffSummary: truncatedSummary,
    diffPatches: diffPatches || undefined,
  };
}

/**
 * Alias for fetchDiffStatBetweenRefs.
 */
export const fetchDiffBetweenRefs = fetchDiffStatBetweenRefs;
