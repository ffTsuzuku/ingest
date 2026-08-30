export type Nullable<T> = T | null;

export interface RepoConfig {
  path: string;
  repo_name?: Nullable<string>;
  branches: string[];
  custom_prompt?: Nullable<string>;
  custom_prompt_file?: Nullable<string>;
  diff_mode?: boolean;
  max_diff_lines?: number;
}

export interface OpencodeProviderConfig {
  provider?: string;
  model: string;
  endpoint?: string;
  api_key_env?: Nullable<string>;
}

export interface GeminiCliProviderConfig {
  model: string;
  gemini_api_key_file?: string;
}

export interface ProviderConfigMap {
  opencode?: OpencodeProviderConfig;
  "gemini-cli"?: GeminiCliProviderConfig;
}

export interface RawConfig {
  repos?: RepoConfig[];
  output_root?: string;
  error_log?: string;
  provider?: ProviderConfigMap;
  agents?: ProviderConfigMap;
  default_provider?: "opencode" | "gemini-cli";
  prompt?: string;
  date_format?: string;
}

export interface AppConfig {
  repos: Array<RepoConfig & { repo_name: Nullable<string>; branches: string[] }>;
  outputRoot: string;
  rawOutputRoot: string;
  errorLogPath: string;
  providers: ProviderConfigMap;
  defaultProvider: "opencode" | "gemini-cli";
  prompt: string;
  configPath: string;
}
