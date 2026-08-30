import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import type { AppConfig, LocalRepoConfig, Nullable, RawConfig, RepoConfig } from "./types.js";
import { parseJsonc } from "./parser.js";
import { Logger } from "../utils/logger.js";

import { existsSync } from "node:fs";

export const DEFAULT_CONFIG_DIR = join(homedir(), ".config", "ingest");
export const DEFAULT_CONFIG_PATH = join(DEFAULT_CONFIG_DIR, "config.jsonc");
export const LEGACY_CONFIG_PATH = join(homedir(), ".config", "git-ingest", "config.jsonc");
export const DEFAULT_OUTPUT_ROOT = join(homedir(), "reports");
export const DEFAULT_RETENTION_DAYS = 30;
export const DEFAULT_ERROR_LOG = "error.log";
export const DEFAULT_PROMPT =
  "Perform an engineering deep dive into repo activity over the last 24h: architectural patterns, key implementation mechanics, code diff analysis, and technical impact.";

export const LOCAL_CONFIG_FILENAMES = [
  ".ingestrc",
  ".ingestrc.json",
  ".ingestrc.jsonc",
  "ingest.config.json",
  "ingest.config.jsonc",
  ".ingest.json",
  ".ingest.jsonc",
];

export function expandHome(inputPath: string): string {
  if (inputPath === "~" || inputPath.startsWith("~/")) {
    return join(homedir(), inputPath.slice(inputPath === "~" ? 1 : 2));
  }
  return inputPath;
}

export function resolveConfiguredPath(rawPath: string, basePath?: string): string {
  const expanded = expandHome(rawPath);
  if (isAbsolute(expanded)) {
    return resolve(expanded);
  }
  if (basePath) {
    return resolve(basePath, expanded);
  }
  return resolve(process.cwd(), expanded);
}

export async function findLocalConfigPath(dirPath: string): Promise<string | null> {
  const resolvedDir = resolveConfiguredPath(dirPath);
  for (const filename of LOCAL_CONFIG_FILENAMES) {
    const candidate = join(resolvedDir, filename);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function loadLocalConfig(dirPath: string): Promise<LocalRepoConfig | null> {
  const localConfigPath = await findLocalConfigPath(dirPath);
  if (!localConfigPath) return null;
  try {
    const content = await readFile(localConfigPath, "utf8");
    return parseJsonc<LocalRepoConfig>(content);
  } catch (err) {
    Logger.warn(`Failed to parse local config at ${localConfigPath}: ${String(err)}`);
    return null;
  }
}

export async function mergeRepoWithLocalConfig(
  repo: RepoConfig,
  baseDir?: string,
): Promise<RepoConfig & { repo_name: Nullable<string>; branches: string[] }> {
  const repoPath = resolveConfiguredPath(repo.path, baseDir);
  const localConfig = await loadLocalConfig(repoPath);
  if (!localConfig) {
    return {
      ...repo,
      repo_name: repo.repo_name ?? null,
      branches: repo.branches && repo.branches.length > 0 ? repo.branches : ["main"],
    };
  }

  let matchingLocalRepo: Partial<RepoConfig> | undefined;
  if (Array.isArray(localConfig.repos) && localConfig.repos.length > 0) {
    matchingLocalRepo = localConfig.repos.find(
      (r) => r.path === repo.path || r.path === "." || resolveConfiguredPath(r.path, repoPath) === repoPath,
    );
    if (!matchingLocalRepo) {
      matchingLocalRepo = localConfig.repos[0];
    }
  }

  const branches =
    matchingLocalRepo?.branches && matchingLocalRepo.branches.length > 0
      ? matchingLocalRepo.branches
      : localConfig.branches && localConfig.branches.length > 0
        ? localConfig.branches
        : repo.branches && repo.branches.length > 0
          ? repo.branches
          : ["main"];

  const repo_name = matchingLocalRepo?.repo_name ?? localConfig.repo_name ?? repo.repo_name ?? null;
  const custom_prompt = matchingLocalRepo?.custom_prompt ?? localConfig.custom_prompt ?? repo.custom_prompt;
  const custom_prompt_file = matchingLocalRepo?.custom_prompt_file ?? localConfig.custom_prompt_file ?? repo.custom_prompt_file;
  const diff_mode = matchingLocalRepo?.diff_mode ?? localConfig.diff_mode ?? repo.diff_mode;
  const max_diff_lines = matchingLocalRepo?.max_diff_lines ?? localConfig.max_diff_lines ?? repo.max_diff_lines;

  return {
    path: repo.path,
    repo_name,
    branches,
    custom_prompt,
    custom_prompt_file,
    diff_mode,
    max_diff_lines,
  };
}

export class ConfigManager {
  public static getDefaultConfigContent(): string {
    return `// Ingest Configuration (~/.config/ingest/config.jsonc)
// Documentation: https://github.com/tsuzuku/ingest
//
// SETTINGS REFERENCE:
// • repos: List of git repositories to analyze in headless runs
//   - path: Local path to repository (supports '~')
//   - repo_name: Custom display name in report headers (null = auto-detect)
//   - branches: Target branches to monitor for commits
//   - diff_mode: Enable git diff deep-dive stats & line changes (+/-)
//   - max_diff_lines: Max patch lines per commit sent to AI context (default: 200)
//   - custom_prompt: Custom review instructions for this repo
// • output_root: Destination directory for reports (<root>/<repo>/YYYY-MM-DD-summary.md)
// • retention_days: Automatic report retention period in days (default: 30, 0 = keep forever)
// • error_log: File path for recording non-fatal error traces (default: error.log)
// • default_provider: Default AI backend ("antigravity" | "opencode" | "gemini-cli")
// • provider: AI backend options (endpoints, model overrides, auth env vars)
// • prompt: Default engineering analysis prompt template
{
  "repos": [
    // {
    //   "path": "~/Git/my-project",
    //   "repo_name": null,
    //   "branches": ["main"],
    //   "diff_mode": true,
    //   "max_diff_lines": 200,
    //   "custom_prompt": null
    // }
  ],
  "output_root": "~/reports",
  "retention_days": 30,
  "error_log": "error.log",
  "default_provider": "antigravity",
  "provider": {
    "antigravity": {
      "dangerously_skip_permissions": true
    },
    "opencode": {
      "model": "qwen-max",
      "endpoint": "http://localhost:1234/v1/chat/completions",
      "api_key_env": null
    }
  },
  "prompt": "Perform an engineering deep dive into repo activity over the last 24h: architectural patterns, key implementation mechanics, code diff analysis, and technical impact."
}
`;
  }

  public static async findLocalConfigPath(dirPath: string): Promise<string | null> {
    return findLocalConfigPath(dirPath);
  }

  public static async loadLocalConfig(dirPath: string): Promise<LocalRepoConfig | null> {
    return loadLocalConfig(dirPath);
  }

  public static async mergeRepoWithLocalConfig(
    repo: RepoConfig,
    baseDir?: string,
  ): Promise<RepoConfig & { repo_name: Nullable<string>; branches: string[] }> {
    return mergeRepoWithLocalConfig(repo, baseDir);
  }

  public static async ensureDefaultConfigExists(targetPath = DEFAULT_CONFIG_PATH): Promise<void> {
    const resolvedPath = resolveConfiguredPath(targetPath);
    try {
      await access(resolvedPath);
    } catch {
      await mkdir(dirname(resolvedPath), { recursive: true });
      await writeFile(resolvedPath, this.getDefaultConfigContent(), "utf8");
      Logger.info(`Created default configuration at ${resolvedPath}`);
    }
  }

  public static async load(customPath?: string, cwd = process.cwd()): Promise<AppConfig> {
    let rawPath = customPath || DEFAULT_CONFIG_PATH;
    if (!customPath && !existsSync(DEFAULT_CONFIG_PATH) && existsSync(LEGACY_CONFIG_PATH)) {
      rawPath = LEGACY_CONFIG_PATH;
    }
    const resolvedConfigPath = resolveConfiguredPath(rawPath);
    const configDir = dirname(resolvedConfigPath);

    let rawConfig: RawConfig = {};
    try {
      const fileContent = await readFile(resolvedConfigPath, "utf8");
      rawConfig = parseJsonc<RawConfig>(fileContent);
    } catch (err: unknown) {
      if (!customPath) {
        // If default config doesn't exist, create it and load default
        await this.ensureDefaultConfigExists(DEFAULT_CONFIG_PATH);
        try {
          const fileContent = await readFile(resolvedConfigPath, "utf8");
          rawConfig = parseJsonc<RawConfig>(fileContent);
        } catch {
          rawConfig = {};
        }
      } else {
        throw new Error(`Failed to read configuration at "${resolvedConfigPath}": ${String(err)}`);
      }
    }

    // Check for repo-local configuration in cwd if customPath was not explicitly specified
    let localCwdConfig: LocalRepoConfig | null = null;
    if (!customPath) {
      localCwdConfig = await loadLocalConfig(cwd);
    }

    const reposInput = Array.isArray(localCwdConfig?.repos) && localCwdConfig.repos.length > 0
      ? localCwdConfig.repos
      : Array.isArray(rawConfig.repos)
        ? rawConfig.repos
        : [];

    const repos = reposInput.map((repo) => {
      const branches = Array.isArray(repo.branches) && repo.branches.length > 0 ? repo.branches : ["main"];
      return {
        path: repo.path,
        repo_name: repo.repo_name ?? null,
        branches,
        custom_prompt: repo.custom_prompt ?? null,
        custom_prompt_file: repo.custom_prompt_file ?? null,
        diff_mode: repo.diff_mode ?? true,
        max_diff_lines: repo.max_diff_lines ?? 200,
      };
    });

    const rawOutputRoot = localCwdConfig?.output_root || rawConfig.output_root || DEFAULT_OUTPUT_ROOT;
    const outputRoot = resolveConfiguredPath(rawOutputRoot, configDir);
    const retentionDays =
      typeof localCwdConfig?.retention_days === "number"
        ? localCwdConfig.retention_days
        : typeof rawConfig.retention_days === "number"
          ? rawConfig.retention_days
          : DEFAULT_RETENTION_DAYS;
    const rawErrorLog = localCwdConfig?.error_log || rawConfig.error_log || DEFAULT_ERROR_LOG;
    const errorLogPath = resolveConfiguredPath(rawErrorLog, configDir);
    const providers = {
      ...(rawConfig.provider || rawConfig.agents || {}),
      ...(localCwdConfig?.provider || localCwdConfig?.agents || {}),
    };
    const defaultProvider = localCwdConfig?.default_provider || rawConfig.default_provider || "antigravity";
    const prompt =
      typeof localCwdConfig?.prompt === "string" && localCwdConfig.prompt.trim() !== ""
        ? localCwdConfig.prompt
        : typeof rawConfig.prompt === "string" && rawConfig.prompt.trim() !== ""
          ? rawConfig.prompt
          : DEFAULT_PROMPT;

    Logger.configure({ logFilePath: errorLogPath });

    return {
      repos,
      outputRoot,
      rawOutputRoot,
      retentionDays,
      errorLogPath,
      providers,
      defaultProvider,
      prompt,
      configPath: resolvedConfigPath,
    };
  }

  public static async save(config: AppConfig): Promise<void> {
    await mkdir(dirname(config.configPath), { recursive: true });
    const content = JSON.stringify(
      {
        repos: config.repos,
        output_root: config.rawOutputRoot,
        retention_days: config.retentionDays,
        error_log: config.errorLogPath,
        default_provider: config.defaultProvider,
        provider: config.providers,
        prompt: config.prompt,
      },
      null,
      2,
    );
    await writeFile(config.configPath, content, "utf8");
  }
}

