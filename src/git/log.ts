import { runGit } from "./runner.js";
import type { CommitRecord, DateFilter } from "./types.js";

const COMMIT_DELIMITER = "__GIT_INGEST_COMMIT_DELIMITER__";

export async function getChangedFilesForCommit(hash: string, repoPath: string): Promise<string[]> {
  try {
    const res = await runGit(["show", "--name-only", "--pretty=format:", hash], repoPath);
    if (res.exitCode !== 0) return [];
    return res.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

export function buildGitDateArgs(filter: DateFilter): string[] {
  const args: string[] = [];

  if (filter.since) {
    args.push(`--since=${filter.since}`);
  } else if (filter.sinceHours !== undefined) {
    args.push(`--since=${filter.sinceHours} hours ago`);
  } else {
    args.push(`--since=24 hours ago`);
  }

  if (filter.until) {
    args.push(`--until=${filter.until}`);
  }

  return args;
}

export async function fetchBranchCommits(
  repoPath: string,
  branch: string,
  filter: DateFilter = {},
): Promise<CommitRecord[]> {
  const format = `${COMMIT_DELIMITER}%n%H%n%an%n%ae%n%cI%n%s%n%b`;
  const dateArgs = buildGitDateArgs(filter);

  const gitArgs = ["log", branch, ...dateArgs, `--format=${format}`];
  const res = await runGit(gitArgs, repoPath);

  if (res.exitCode !== 0) {
    // If branch doesn't exist or git error, return empty
    return [];
  }

  if (!res.stdout) {
    return [];
  }

  const rawBlocks = res.stdout.split(COMMIT_DELIMITER).map((b) => b.trim()).filter((b) => b.length > 0);
  const commits: CommitRecord[] = [];

  for (const block of rawBlocks) {
    const lines = block.split("\n");
    if (lines.length < 5) continue;

    const hash = lines[0]?.trim() || "";
    const author = lines[1]?.trim() || "";
    const email = lines[2]?.trim() || "";
    const timestamp = lines[3]?.trim() || "";
    const subject = lines[4]?.trim() || "";
    const body = lines.slice(5).join("\n").trim();

    if (!hash) continue;

    const filesChanged = await getChangedFilesForCommit(hash, repoPath);

    commits.push({
      hash,
      author,
      email,
      timestamp,
      subject,
      body,
      branch,
      filesChanged,
    });
  }

  return commits;
}

export async function fetchRepoCommits(
  repoPath: string,
  branches: string[],
  filter: DateFilter = {},
): Promise<CommitRecord[]> {
  const seenHashes = new Set<string>();
  const allCommits: CommitRecord[] = [];

  for (const branch of branches) {
    const branchCommits = await fetchBranchCommits(repoPath, branch, filter);
    for (const commit of branchCommits) {
      if (!seenHashes.has(commit.hash)) {
        seenHashes.add(commit.hash);
        allCommits.push(commit);
      }
    }
  }

  // Sort by timestamp descending
  return allCommits.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
}
