import { executeCommand } from "../utils/command.js";
import { buildAnalysisPrompt } from "./prompt.js";
import type { AIProvider, AnalysisContext, AnalysisResult } from "./types.js";
import type { OpencodeProviderConfig } from "../config/types.js";

export class OpencodeProvider implements AIProvider {
  public readonly id = "opencode";
  public readonly name = "Opencode CLI";

  constructor(private readonly config: OpencodeProviderConfig) {}

  public async isAvailable(): Promise<boolean> {
    try {
      const res = await executeCommand("opencode", ["--version"]);
      return res.exitCode === 0;
    } catch {
      return false;
    }
  }

  public async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const prompt = buildAnalysisPrompt(context);
    const providerTag = this.config.provider ? `${this.config.provider}/${this.config.model}` : this.config.model;

    const env: NodeJS.ProcessEnv = {};
    if (this.config.api_key_env && process.env[this.config.api_key_env]) {
      env[this.config.api_key_env] = process.env[this.config.api_key_env];
    }

    const args = ["run", "--format", "json", "--model", providerTag, prompt];
    const result = await executeCommand("opencode", args, {
      cwd: context.repoPath,
      env,
      timeoutMs: 180000,
    });

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || "Opencode CLI invocation failed.");
    }

    const rawResult = result.stdout.trim();
    const jsonLines = rawResult.split("\n").map((l) => l.trim()).filter(Boolean);

    for (let i = jsonLines.length - 1; i >= 0; i--) {
      const line = jsonLines[i] ?? "";
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        const message =
          (typeof parsed.content === "string" && parsed.content) ||
          (typeof parsed.text === "string" && parsed.text) ||
          (typeof parsed.message === "string" && parsed.message);
        if (message) {
          return {
            content: message.trim(),
            providerLabel: `opencode:${providerTag}`,
            rawResult,
          };
        }
      } catch {
        continue;
      }
    }

    return {
      content: rawResult,
      providerLabel: `opencode:${providerTag}`,
      rawResult,
    };
  }
}
