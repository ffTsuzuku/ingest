import { executeCommand } from "../utils/command.js";
import { buildAnalysisPrompt } from "./prompt.js";
import type { AIProvider, AnalysisContext, AnalysisResult } from "./types.js";
import type { ClaudeProviderConfig } from "../config/types.js";

export class ClaudeProvider implements AIProvider {
  public readonly id = "claude";
  public readonly name = "Claude Code CLI";

  constructor(private readonly config: ClaudeProviderConfig = {}) {}

  public async isAvailable(): Promise<boolean> {
    try {
      const res = await executeCommand("claude", ["--version"], { timeoutMs: 2000 });
      return res.exitCode === 0;
    } catch {
      return false;
    }
  }

  public async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const prompt = buildAnalysisPrompt(context);
    const modelLabel = this.config.model ? `:${this.config.model}` : "";
    const providerLabel = `claude${modelLabel}`;

    const content = await this.generate(prompt, context.repoPath);

    return {
      content,
      providerLabel,
      rawResult: content,
      tokenUsage: {},
    };
  }

  public async generate(prompt: string, cwd?: string): Promise<string> {
    const args: string[] = ["-p", prompt];

    if (this.config.model) {
      args.unshift("--model", this.config.model);
    }

    const result = await executeCommand("claude", args, {
      cwd: cwd || process.cwd(),
      timeoutMs: 300000,
    });

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || "Claude Code CLI invocation failed.");
    }

    const rawOutput = result.stdout.trim();
    if (!rawOutput) {
      throw new Error("Claude Code CLI returned an empty response.");
    }

    return rawOutput;
  }
}
