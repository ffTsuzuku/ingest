export type Nullable<T> = T | null;

export type ReportStyle = "default" | "system-centric" | "changelog" | "security" | string;

export interface RepoConfig {
  path: string;
  repo_name?: Nullable<string>;
  branches: string[];
  custom_prompt?: Nullable<string>;
  custom_prompt_file?: Nullable<string>;
  report_style?: Nullable<ReportStyle>;
  diff_mode?: boolean;
  max_diff_lines?: number;
}

export interface OpencodeProviderConfig {
  provider?: string;
  model: string;
  endpoint?: string;
  api_key_env?: Nullable<string>;
}

export interface AntigravityProviderConfig {
  model?: string;
  dangerously_skip_permissions?: boolean;
  effort?: "low" | "medium" | "high";
}

export interface ProviderConfigMap {
  antigravity?: AntigravityProviderConfig;
  agy?: AntigravityProviderConfig;
  opencode?: OpencodeProviderConfig;
  "gemini-cli"?: AntigravityProviderConfig;
}

export interface RawConfig {
  repos?: RepoConfig[];
  output_root?: string;
  retention_days?: number;
  error_log?: string;
  provider?: ProviderConfigMap;
  agents?: ProviderConfigMap;
  default_provider?: "antigravity" | "opencode" | "gemini-cli" | "agy";
  prompt?: string;
  report_style?: ReportStyle;
  date_format?: string;
}

export interface LocalRepoConfig {
  path?: string;
  repo_name?: Nullable<string>;
  branches?: string[];
  custom_prompt?: Nullable<string>;
  custom_prompt_file?: Nullable<string>;
  report_style?: Nullable<ReportStyle>;
  diff_mode?: boolean;
  max_diff_lines?: number;
  output_root?: string;
  retention_days?: number;
  error_log?: string;
  provider?: ProviderConfigMap;
  agents?: ProviderConfigMap;
  default_provider?: "antigravity" | "opencode" | "gemini-cli" | "agy";
  prompt?: string;
  date_format?: string;
  repos?: RepoConfig[];
}

export interface AppConfig {
  repos: Array<RepoConfig & { repo_name: Nullable<string>; branches: string[] }>;
  outputRoot: string;
  rawOutputRoot: string;
  retentionDays: number;
  errorLogPath: string;
  providers: ProviderConfigMap;
  defaultProvider: "antigravity" | "opencode" | "gemini-cli" | "agy";
  prompt: string;
  reportStyle?: ReportStyle;
  configPath: string;
}


