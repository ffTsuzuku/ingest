import type { TokenUsage } from "../ai/types.js";

export type { TokenUsage };

export interface ReportMeta {
  repoName: string;
  repoPath: string;
  branches: string[];
  branch?: string;
  dateStr: string;
  generatedAt: string;
  providerLabel: string;
  commitCount: number;
  reportStyle?: string;
  tokenUsage?: TokenUsage;
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
  branch?: string;
  sizeBytes: number;
  modifiedAt: Date;
  reportStyle?: string;
  tokenUsage?: TokenUsage;
}

