import type { CommitRecord, DiffStat } from "../git/types.js";
import type { ReportStyle } from "../config/types.js";

export interface AnalysisContext {
  repoName: string;
  repoPath: string;
  branches: string[];
  branch?: string;
  dateStr: string;
  commits: CommitRecord[];
  diffStat?: DiffStat;
  customPrompt?: string | null;
  basePrompt: string;
  reportStyle?: ReportStyle;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AnalysisResult {
  content: string;
  providerLabel: string;
  rawResult?: string;
  tokenUsage?: TokenUsage;
}

export interface RepoRollupActivity {
  repoName: string;
  repoPath: string;
  branches: string[];
  commits: CommitRecord[];
  diffStat?: DiffStat;
}

export interface MultiRepoRollupContext {
  workspaceName?: string;
  dateStr: string;
  repos: RepoRollupActivity[];
  basePrompt: string;
  customPrompt?: string | null;
  reportStyle?: ReportStyle;
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): Promise<boolean>;
  analyze(context: AnalysisContext): Promise<AnalysisResult>;
  generate?(prompt: string, cwd?: string): Promise<string>;
  analyzeMultiRepo?(context: MultiRepoRollupContext): Promise<AnalysisResult>;
}

