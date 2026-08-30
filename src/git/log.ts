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

export interface DateFilterOptions {
  dateStr?: string;
  sinceStr?: string;
  untilStr?: string;
  sinceHours?: number;
}

export interface ResolvedDateRange {
  dateFilter: DateFilter;
  reportDateStr: string;
}

export function resolveDateFilter(opts: DateFilterOptions = {}): ResolvedDateRange {
  // If sinceStr or untilStr explicitly provided
  if (opts.sinceStr || opts.untilStr) {
    const since = opts.sinceStr
      ? /^\d{4}-\d{2}-\d{2}$/.test(opts.sinceStr)
        ? `${opts.sinceStr} 00:00:00`
        : opts.sinceStr
      : undefined;
    const until = opts.untilStr
      ? /^\d{4}-\d{2}-\d{2}$/.test(opts.untilStr)
        ? `${opts.untilStr} 23:59:59`
        : opts.untilStr
      : undefined;

    let reportDateStr: string;
    if (opts.sinceStr && opts.untilStr) {
      reportDateStr = `${opts.sinceStr.slice(0, 10)}-to-${opts.untilStr.slice(0, 10)}`;
    } else if (opts.sinceStr) {
      reportDateStr = `since-${opts.sinceStr.slice(0, 10)}`;
    } else {
      reportDateStr = `until-${opts.untilStr!.slice(0, 10)}`;
    }

    return {
      dateFilter: {
        since,
        until,
      },
      reportDateStr,
    };
  }

  // If dateStr provided (could be single date or range)
  if (opts.dateStr) {
    const trimmed = opts.dateStr.trim();
    // Check range patterns: YYYY-MM-DD..YYYY-MM-DD, YYYY-MM-DD...YYYY-MM-DD, YYYY-MM-DD to YYYY-MM-DD, YYYY-MM-DD_to_YYYY-MM-DD, YYYY-MM-DD:YYYY-MM-DD
    const rangeMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s*(?:\.\.|\.\.\.| to |_to_|:|\s-\s)\s*(\d{4}-\d{2}-\d{2})$/);
    if (rangeMatch) {
      let start = rangeMatch[1]!;
      let end = rangeMatch[2]!;
      if (start > end) {
        [start, end] = [end, start];
      }
      return {
        dateFilter: {
          since: `${start} 00:00:00`,
          until: `${end} 23:59:59`,
        },
        reportDateStr: `${start}-to-${end}`,
      };
    }

    // Single YYYY-MM-DD date
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return {
        dateFilter: {
          since: `${trimmed} 00:00:00`,
          until: `${trimmed} 23:59:59`,
        },
        reportDateStr: trimmed,
      };
    }

    // Custom date string
    return {
      dateFilter: {
        since: trimmed,
      },
      reportDateStr: trimmed,
    };
  }

  if (opts.sinceHours !== undefined) {
    const today = new Date().toISOString().slice(0, 10);
    return {
      dateFilter: {
        sinceHours: opts.sinceHours,
      },
      reportDateStr: today,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  return {
    dateFilter: {
      sinceHours: 24,
    },
    reportDateStr: today,
  };
}

