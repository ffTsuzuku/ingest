import { executeCommand } from "../utils/command.js";
import { buildAnalysisPrompt } from "./prompt.js";
import type { AIProvider, AnalysisContext, AnalysisResult } from "./types.js";
import type { OllamaProviderConfig } from "../config/types.js";

export class OllamaProvider implements AIProvider {
  public readonly id = "ollama";
  public readonly name = "Ollama Local LLM";

  constructor(private readonly config: OllamaProviderConfig = {}) {}

  public async isAvailable(): Promise<boolean> {
    try {
      const res = await executeCommand("ollama", ["--version"], { timeoutMs: 2000 });
      return res.exitCode === 0;
    } catch {
      return false;
    }
  }

  public async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const prompt = buildAnalysisPrompt(context);
    const model = this.config.model || "llama3.2";
    const providerLabel = `ollama:${model}`;

    const content = await this.generate(prompt, context.repoPath);

    return {
      content,
      providerLabel,
      rawResult: content,
      tokenUsage: {},
    };
  }

  public async generate(prompt: string, cwd?: string): Promise<string> {
    const model = this.config.model || "llama3.2";
    const env: NodeJS.ProcessEnv = {};
    if (this.config.endpoint) {
      env.OLLAMA_HOST = this.config.endpoint;
    }

    const args = ["run", model, prompt];
    const result = await executeCommand("ollama", args, {
      cwd: cwd || process.cwd(),
      env,
      timeoutMs: 300000,
    });

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || "Ollama invocation failed.");
    }

    const rawOutput = result.stdout.trim();
    if (!rawOutput) {
      throw new Error("Ollama returned an empty response.");
    }

    return rawOutput;
  }
}
