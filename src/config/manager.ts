import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import type { AppConfig, RawConfig, RepoConfig } from "./types.js";
import { parseJsonc } from "./parser.js";
import { Logger } from "../utils/logger.js";

import { existsSync } from "node:fs";

export const DEFAULT_CONFIG_DIR = join(homedir(), ".config", "ingest");
export const DEFAULT_CONFIG_PATH = join(DEFAULT_CONFIG_DIR, "config.jsonc");
export const LEGACY_CONFIG_PATH = join(homedir(), ".config", "git-ingest", "config.jsonc");
export const DEFAULT_OUTPUT_ROOT = join(homedir(), "reports");
export const DEFAULT_ERROR_LOG = "error.log";
export const DEFAULT_PROMPT =
  "Perform an engineering deep dive into repo activity over the last 24h: architectural patterns, key implementation mechanics, code diff analysis, and technical impact.";

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

export class ConfigManager {
  public static getDefaultConfigContent(): string {
    return `// ingest configuration
{
  "repos": [
    // {
    //   "path": "/path/to/repo",
    //   "repo_name": null, // null = auto detect from Git remote origin or repository name
    //   "branches": ["main"],
    //   "custom_prompt": null,
    //   "diff_mode": true
    // }
  ],
  "output_root": "~/reports",
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

  public static async load(customPath?: string): Promise<AppConfig> {
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

    const reposInput = Array.isArray(rawConfig.repos) ? rawConfig.repos : [];
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

    const rawOutputRoot = rawConfig.output_root || DEFAULT_OUTPUT_ROOT;
    const outputRoot = resolveConfiguredPath(rawOutputRoot, configDir);
    const rawErrorLog = rawConfig.error_log || DEFAULT_ERROR_LOG;
    const errorLogPath = resolveConfiguredPath(rawErrorLog, configDir);
    const providers = rawConfig.provider || rawConfig.agents || {};
    const defaultProvider = rawConfig.default_provider || "antigravity";
    const prompt = typeof rawConfig.prompt === "string" && rawConfig.prompt.trim() !== "" ? rawConfig.prompt : DEFAULT_PROMPT;

    Logger.configure({ logFilePath: errorLogPath });

    return {
      repos,
      outputRoot,
      rawOutputRoot,
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
