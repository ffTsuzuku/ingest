import { executeCommand } from "../utils/command.js";
import { buildAnalysisPrompt } from "./prompt.js";
import type { AIProvider, AnalysisContext, AnalysisResult } from "./types.js";
import type { CodexProviderConfig } from "../config/types.js";

export class CodexProvider implements AIProvider {
  public readonly id = "codex";
  public readonly name = "OpenAI Codex CLI";

  constructor(private readonly config: CodexProviderConfig = {}) {}

  public async isAvailable(): Promise<boolean> {
    try {
      const res = await executeCommand("codex", ["--version"], { timeoutMs: 2000 });
      return res.exitCode === 0;
    } catch {
      return false;
    }
  }

  public async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const prompt = buildAnalysisPrompt(context);
    const modelLabel = this.config.model ? `:${this.config.model}` : "";
    const providerLabel = `codex${modelLabel}`;

    const content = await this.generate(prompt, context.repoPath);

    return {
      content,
      providerLabel,
      rawResult: content,
      tokenUsage: {},
    };
  }

  public async generate(prompt: string, cwd?: string): Promise<string> {
    const args: string[] = ["exec"];

    if (this.config.ephemeral !== false) {
      args.push("--ephemeral");
    }

    if (this.config.model) {
      args.push("--model", this.config.model);
    }

    args.push(prompt);

    const result = await executeCommand("codex", args, {
      cwd: cwd || process.cwd(),
      timeoutMs: 300000,
    });

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || "OpenAI Codex CLI invocation failed.");
    }

    const rawOutput = result.stdout.trim();
    if (!rawOutput) {
      throw new Error("OpenAI Codex CLI returned an empty response.");
    }

    return rawOutput;
  }
}
