import { runGit } from "./runner.js";
import { buildGitDateArgs } from "./log.js";
import type { DateFilter, DiffStat } from "./types.js";

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

  return {
    filesChangedCount: totalFiles || fileStats.length,
    insertions: totalInsertions,
    deletions: totalDeletions,
    fileStats: fileStats.slice(0, 30),
    diffSummary: truncatedSummary,
  };
}
