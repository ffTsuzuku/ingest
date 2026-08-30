import type { CommitRecord, DiffStat } from "../git/types.js";
import type { ReportStyle } from "../config/types.js";

export interface AnalysisContext {
  repoName: string;
  repoPath: string;
  branches: string[];
  dateStr: string;
  commits: CommitRecord[];
  diffStat?: DiffStat;
  customPrompt?: string | null;
  basePrompt: string;
  reportStyle?: ReportStyle;
}

export interface AnalysisResult {
  content: string;
  providerLabel: string;
  rawResult?: string;
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): Promise<boolean>;
  analyze(context: AnalysisContext): Promise<AnalysisResult>;
}

