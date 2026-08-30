export interface ReportMeta {
  repoName: string;
  repoPath: string;
  branches: string[];
  dateStr: string;
  generatedAt: string;
  providerLabel: string;
  commitCount: number;
  reportStyle?: string;
}

export interface GeneratedReport {
  meta: ReportMeta;
  markdownContent: string;
  filePath: string;
}

export interface ReportSummary {
  filePath: string;
  fileName: string;
  repoName: string;
  dateStr: string;
  sizeBytes: number;
  modifiedAt: Date;
  reportStyle?: string;
}

