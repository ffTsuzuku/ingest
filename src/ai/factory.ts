import type { AIProvider } from "./types.js";
import type { AppConfig } from "../config/types.js";
import { OpencodeProvider } from "./opencode.js";
import { GeminiCliProvider } from "./gemini-cli.js";

export class AIFactory {
  public static getProvider(config: AppConfig, overrideProviderName?: string): AIProvider {
    const targetProvider = overrideProviderName || config.defaultProvider;

    if (targetProvider === "opencode" || (!overrideProviderName && config.providers.opencode)) {
      if (config.providers.opencode) {
        return new OpencodeProvider(config.providers.opencode);
      }
    }

    if (targetProvider === "gemini-cli" || (!overrideProviderName && config.providers["gemini-cli"])) {
      if (config.providers["gemini-cli"]) {
        return new GeminiCliProvider(config.providers["gemini-cli"]);
      }
    }

    // Fallback order
    if (config.providers.opencode) {
      return new OpencodeProvider(config.providers.opencode);
    }
    if (config.providers["gemini-cli"]) {
      return new GeminiCliProvider(config.providers["gemini-cli"]);
    }

    throw new Error(
      "No valid AI provider configured. Please configure 'opencode' or 'gemini-cli' in your config file.",
    );
  }
}
