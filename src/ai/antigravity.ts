import { executeCommand } from "../utils/command.js";
import { buildAnalysisPrompt } from "./prompt.js";
import type { AIProvider, AnalysisContext, AnalysisResult, TokenUsage } from "./types.js";
import type { AntigravityProviderConfig } from "../config/types.js";

interface AgyJsonResponse {
  conversation_id?: string;
  status?: string;
  response?: string;
  duration_seconds?: number;
  num_turns?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    thinking_tokens?: number;
    cache_read_tokens?: number;
    total_tokens?: number;
  };
}

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
    const modelLabel = this.config.model ? `:${this.config.model}` : "";
    const providerLabel = `agy${modelLabel}`;

    const { content, tokenUsage } = await this.executeAgy(prompt, context.repoPath, providerLabel);

    return {
      content,
      providerLabel,
      rawResult: content,
      tokenUsage,
    };
  }

  public async generate(prompt: string, cwd?: string): Promise<string> {
    const modelLabel = this.config.model ? `:${this.config.model}` : "";
    const { content } = await this.executeAgy(prompt, cwd, `agy${modelLabel}`);
    return content;
  }

  private async executeAgy(
    prompt: string,
    cwd?: string,
    providerLabel = "agy",
  ): Promise<{ content: string; tokenUsage: TokenUsage }> {
    const args = ["--print", prompt, "--output-format", "json"];

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
      cwd: cwd || process.cwd(),
      timeoutMs: 300000,
    });

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || "Antigravity CLI (agy) invocation failed.");
    }

    const rawOutput = result.stdout.trim();
    if (!rawOutput) {
      throw new Error("Antigravity CLI returned an empty response.");
    }

    // Attempt to parse JSON response with exact token usage
    try {
      const parsed = JSON.parse(rawOutput) as AgyJsonResponse;
      const content = (parsed.response || rawOutput).trim();

      if (parsed.usage && typeof parsed.usage.total_tokens === "number") {
        const promptTokens = parsed.usage.input_tokens;
        const completionTokens = (parsed.usage.output_tokens ?? 0) + (parsed.usage.thinking_tokens ?? 0);
        const totalTokens = parsed.usage.total_tokens;

        return {
          content,
          tokenUsage: {
            promptTokens,
            completionTokens,
            totalTokens,
          },
        };
      }

      return {
        content,
        tokenUsage: {},
      };
    } catch {
      return {
        content: rawOutput,
        tokenUsage: {},
      };
    }
  }
}
