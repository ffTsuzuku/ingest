import type { CommitRecord, DiffStat } from "../git/types.js";

export interface AnalysisContext {
  repoName: string;
  repoPath: string;
  branches: string[];
  dateStr: string;
  commits: CommitRecord[];
  diffStat?: DiffStat;
  customPrompt?: string | null;
  basePrompt: string;
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
