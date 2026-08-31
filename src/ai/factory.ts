import type { AIProvider } from "./types.js";
import type { AppConfig, CustomProviderConfig } from "../config/types.js";
import { AntigravityProvider } from "./antigravity.js";
import { OpencodeProvider } from "./opencode.js";
import { ClaudeProvider } from "./claude.js";
import { CodexProvider } from "./codex.js";
import { PiProvider } from "./pi.js";
import { OllamaProvider } from "./ollama.js";
import { AiderProvider } from "./aider.js";
import { CustomProvider } from "./custom.js";

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

    if (targetProvider === "claude" || (!overrideProviderName && config.providers.claude)) {
      return new ClaudeProvider(config.providers.claude || {});
    }

    if (targetProvider === "codex" || (!overrideProviderName && config.providers.codex)) {
      return new CodexProvider(config.providers.codex || {});
    }

    if (targetProvider === "pi" || (!overrideProviderName && config.providers.pi)) {
      return new PiProvider(config.providers.pi || {});
    }

    if (targetProvider === "ollama" || (!overrideProviderName && config.providers.ollama)) {
      return new OllamaProvider(config.providers.ollama || {});
    }

    if (targetProvider === "aider" || (!overrideProviderName && config.providers.aider)) {
      return new AiderProvider(config.providers.aider || {});
    }

    if (targetProvider === "custom" || (!overrideProviderName && config.providers.custom)) {
      const customConfig = (config.providers.custom || { command: "echo" }) as CustomProviderConfig;
      return new CustomProvider(customConfig);
    }

    if (targetProvider === "opencode" || (!overrideProviderName && config.providers.opencode)) {
      if (config.providers.opencode) {
        return new OpencodeProvider(config.providers.opencode);
      }
      return new OpencodeProvider({ model: "qwen-max" });
    }

    // Fallbacks
    if (config.providers.antigravity || config.providers.agy || config.providers["gemini-cli"]) {
      const agyConfig = config.providers.antigravity || config.providers.agy || config.providers["gemini-cli"] || {};
      return new AntigravityProvider(agyConfig);
    }
    if (config.providers.claude) return new ClaudeProvider(config.providers.claude);
    if (config.providers.codex) return new CodexProvider(config.providers.codex);
    if (config.providers.pi) return new PiProvider(config.providers.pi);
    if (config.providers.opencode) return new OpencodeProvider(config.providers.opencode);

    // Default to AntigravityProvider if nothing is explicitly configured
    return new AntigravityProvider({});
  }
}

