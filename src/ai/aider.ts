import { executeCommand } from "../utils/command.js";
import { buildAnalysisPrompt } from "./prompt.js";
import type { AIProvider, AnalysisContext, AnalysisResult } from "./types.js";
import type { AiderProviderConfig } from "../config/types.js";

export class AiderProvider implements AIProvider {
  public readonly id = "aider";
  public readonly name = "Aider AI";

  constructor(private readonly config: AiderProviderConfig = {}) {}

  public async isAvailable(): Promise<boolean> {
    try {
      const res = await executeCommand("aider", ["--version"], { timeoutMs: 2000 });
      return res.exitCode === 0;
    } catch {
      return false;
    }
  }

  public async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const prompt = buildAnalysisPrompt(context);
    const modelLabel = this.config.model ? `:${this.config.model}` : "";
    const providerLabel = `aider${modelLabel}`;

    const content = await this.generate(prompt, context.repoPath);

    return {
      content,
      providerLabel,
      rawResult: content,
      tokenUsage: {},
    };
  }

  public async generate(prompt: string, cwd?: string): Promise<string> {
    const args: string[] = ["--no-git", "--yes", "--message", prompt];

    if (this.config.model) {
      args.unshift("--model", this.config.model);
    }

    const result = await executeCommand("aider", args, {
      cwd: cwd || process.cwd(),
      timeoutMs: 300000,
    });

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || "Aider invocation failed.");
    }

    const rawOutput = result.stdout.trim();
    if (!rawOutput) {
      throw new Error("Aider returned an empty response.");
    }

    return rawOutput;
  }
}
