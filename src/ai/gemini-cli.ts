import { executeCommand } from "../utils/command.js";
import { resolveConfiguredPath } from "../config/manager.js";
import { buildAnalysisPrompt } from "./prompt.js";
import type { AIProvider, AnalysisContext, AnalysisResult } from "./types.js";
import type { GeminiCliProviderConfig } from "../config/types.js";

export class GeminiCliProvider implements AIProvider {
  public readonly id = "gemini-cli";
  public readonly name = "Gemini CLI";

  constructor(private readonly config: GeminiCliProviderConfig) {}

  public async isAvailable(): Promise<boolean> {
    try {
      const res = await executeCommand("gemini", ["--version"]);
      return res.exitCode === 0;
    } catch {
      return false;
    }
  }

  public async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const prompt = buildAnalysisPrompt(context);

    const env: NodeJS.ProcessEnv = {};
    if (this.config.gemini_api_key_file) {
      env.GEMINI_API_KEY_FILE = resolveConfiguredPath(this.config.gemini_api_key_file);
    }

    const args = ["--model", this.config.model];
    const result = await executeCommand("gemini", args, {
      input: prompt,
      cwd: context.repoPath,
      env,
      timeoutMs: 180000,
    });

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || "Gemini CLI invocation failed.");
    }

    const content = result.stdout.trim();
    if (!content) {
      throw new Error("Gemini CLI returned an empty response.");
    }

    return {
      content,
      providerLabel: `gemini-cli:${this.config.model}`,
      rawResult: content,
    };
  }
}
