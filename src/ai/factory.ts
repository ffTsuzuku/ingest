import type { AIProvider } from "./types.js";
import type { AppConfig } from "../config/types.js";
import { AntigravityProvider } from "./antigravity.js";
import { OpencodeProvider } from "./opencode.js";

export class AIFactory {
  public static getProvider(config: AppConfig, overrideProviderName?: string): AIProvider {
    const targetProvider = overrideProviderName || config.defaultProvider;

    if (
      targetProvider === "antigravity" ||
      targetProvider === "agy" ||
      targetProvider === "gemini-cli" ||
      (!overrideProviderName && (config.providers.antigravity || config.providers.agy || config.providers["gemini-cli"]))
    ) {
      const agyConfig = config.providers.antigravity || config.providers.agy || config.providers["gemini-cli"] || {};
      return new AntigravityProvider(agyConfig);
    }

    if (targetProvider === "opencode" || (!overrideProviderName && config.providers.opencode)) {
      if (config.providers.opencode) {
        return new OpencodeProvider(config.providers.opencode);
      }
    }

    // Fallbacks
    if (config.providers.antigravity || config.providers.agy || config.providers["gemini-cli"]) {
      const agyConfig = config.providers.antigravity || config.providers.agy || config.providers["gemini-cli"] || {};
      return new AntigravityProvider(agyConfig);
    }
    if (config.providers.opencode) {
      return new OpencodeProvider(config.providers.opencode);
    }

    // Default to AntigravityProvider if nothing is explicitly configured
    return new AntigravityProvider({});
  }
}
