import { executeCommand } from "../utils/command.js";
import { buildAnalysisPrompt } from "./prompt.js";
import type { AIProvider, AnalysisContext, AnalysisResult } from "./types.js";
import type { CustomProviderConfig } from "../config/types.js";

export class CustomProvider implements AIProvider {
  public readonly id = "custom";
  public readonly name = "Custom CLI Harness";

  constructor(private readonly config: CustomProviderConfig) {}

  public async isAvailable(): Promise<boolean> {
    if (!this.config.command) return false;
    try {
      const checkArgs = this.config.check_args || ["--version"];
      const res = await executeCommand(this.config.command, checkArgs, { timeoutMs: 2000 });
      return res.exitCode === 0;
    } catch {
      return false;
    }
  }

  public async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const prompt = buildAnalysisPrompt(context);
    const providerLabel = `custom:${this.config.command}`;

    const content = await this.generate(prompt, context.repoPath);

    return {
      content,
      providerLabel,
      rawResult: content,
      tokenUsage: {},
    };
  }

  public async generate(prompt: string, cwd?: string): Promise<string> {
    if (!this.config.command) {
      throw new Error("Custom provider command is not defined.");
    }

    const baseArgs = this.config.args || [];
    const args = [...baseArgs, prompt];

    const env: NodeJS.ProcessEnv = {};
    if (this.config.api_key_env && process.env[this.config.api_key_env]) {
      env[this.config.api_key_env] = process.env[this.config.api_key_env];
    }

    const result = await executeCommand(this.config.command, args, {
      cwd: cwd || process.cwd(),
      env,
      timeoutMs: 300000,
    });

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Custom CLI (${this.config.command}) invocation failed.`);
    }

    const rawOutput = result.stdout.trim();
    if (!rawOutput) {
      throw new Error(`Custom CLI (${this.config.command}) returned an empty response.`);
    }

    return rawOutput;
  }
}
