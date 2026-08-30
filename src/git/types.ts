export interface CommitRecord {
  hash: string;
  author: string;
  email: string;
  subject: string;
  body: string;
  branch: string;
  timestamp: string;
  filesChanged: string[];
}

export interface DiffStat {
  filesChangedCount: number;
  insertions: number;
  deletions: number;
  fileStats: Array<{
    path: string;
    insertions: number;
    deletions: number;
  }>;
  diffSummary: string;
  diffPatches?: string;
}

export interface RepoScanResult {
  repoPath: string;
  repoName: string;
  branches: string[];
  commits: CommitRecord[];
  diffStat?: DiffStat;
}

export interface DateFilter {
  since?: string;
  until?: string;
  sinceHours?: number;
}
