import { executeCommand } from "../utils/command.js";
import { buildAnalysisPrompt } from "./prompt.js";
import type { AIProvider, AnalysisContext, AnalysisResult } from "./types.js";
import type { AntigravityProviderConfig } from "../config/types.js";

export class AntigravityProvider implements AIProvider {
  public readonly id = "antigravity";
  public readonly name = "Antigravity CLI (agy)";

  constructor(private readonly config: AntigravityProviderConfig = {}) {}

  public async isAvailable(): Promise<boolean> {
    try {
      const res = await executeCommand("agy", ["--help"]);
      return res.exitCode === 0;
    } catch {
      return false;
    }
  }

  public async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const prompt = buildAnalysisPrompt(context);

    const args = ["--print", prompt];

    // Default dangerously_skip_permissions to true unless explicitly set to false
    if (this.config.dangerously_skip_permissions !== false) {
      args.push("--dangerously-skip-permissions");
    }

    if (this.config.model) {
      args.push("--model", this.config.model);
    }

    if (this.config.effort) {
      args.push("--effort", this.config.effort);
    }

    const result = await executeCommand("agy", args, {
      cwd: context.repoPath,
      timeoutMs: 300000,
    });

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || "Antigravity CLI (agy) invocation failed.");
    }

    const content = result.stdout.trim();
    if (!content) {
      throw new Error("Antigravity CLI returned an empty response.");
    }

    const modelLabel = this.config.model ? `:${this.config.model}` : "";

    return {
      content,
      providerLabel: `agy${modelLabel}`,
      rawResult: content,
    };
  }
}
