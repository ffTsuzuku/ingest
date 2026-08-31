import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HarnessDiscovery, KNOWN_HARNESSES } from "../src/ai/discovery.js";
import { AIFactory } from "../src/ai/factory.js";
import { ClaudeProvider } from "../src/ai/claude.js";
import { CodexProvider } from "../src/ai/codex.js";
import { PiProvider } from "../src/ai/pi.js";
import { OllamaProvider } from "../src/ai/ollama.js";
import { AiderProvider } from "../src/ai/aider.js";
import { CustomProvider } from "../src/ai/custom.js";
import type { AppConfig } from "../src/config/types.js";

describe("AI Harness Discovery & Probing", () => {
  it("should contain registry with supported harnesses (agy, claude, codex, pi, opencode, etc.)", () => {
    assert.ok(KNOWN_HARNESSES.length >= 8);
    const ids = KNOWN_HARNESSES.map((h) => h.id);
    assert.ok(ids.includes("antigravity"));
    assert.ok(ids.includes("claude"));
    assert.ok(ids.includes("codex"));
    assert.ok(ids.includes("pi"));
    assert.ok(ids.includes("opencode"));
    assert.ok(ids.includes("ollama"));
    assert.ok(ids.includes("aider"));
    assert.ok(ids.includes("gemini-cli"));
  });

  it("should discover all harnesses and return availability flags", async () => {
    const discovered = await HarnessDiscovery.discoverAll(1000);
    assert.ok(Array.isArray(discovered));
    assert.equal(discovered.length, KNOWN_HARNESSES.length);

    for (const item of discovered) {
      assert.ok(typeof item.available === "boolean");
      assert.ok(item.name);
      assert.ok(item.description);
    }
  });

  it("should build dynamic menu choices with detection badges", () => {
    const mockDiscovered = [
      {
        id: "agy",
        name: "Antigravity CLI (agy)",
        binary: "agy",
        checkArgs: ["--help"],
        description: "Antigravity CLI",
        available: true,
        version: "1.2.0",
        recommended: true,
      },
      {
        id: "pi",
        name: "Pi Coding Agent",
        binary: "pi",
        checkArgs: ["--version"],
        description: "Pi Agent",
        available: false,
      },
    ];

    const choices = HarnessDiscovery.buildMenuChoices(mockDiscovered, "agy");
    assert.equal(choices.length, 3); // 2 + custom

    assert.ok(choices[0]?.label.includes("Detected ✔"));
    assert.ok(choices[0]?.label.includes("v1.2.0"));
    assert.equal(choices[0]?.selected, true);

    assert.ok(choices[1]?.label.includes("Not in PATH"));
    assert.equal(choices[2]?.value, "custom");
  });

  it("should resolve detected default fallback cleanly", async () => {
    const defaultProvider = await HarnessDiscovery.getDetectedDefault();
    assert.ok(typeof defaultProvider === "string");
    assert.ok(defaultProvider.length > 0);
  });
});

describe("AI Factory Extended Harness Routing", () => {
  const baseConfig: AppConfig = {
    repos: [],
    outputRoot: "~/reports",
    rawOutputRoot: "~/reports",
    retentionDays: 30,
    errorLogPath: "error.log",
    providers: {},
    defaultProvider: "antigravity",
    prompt: "Test prompt",
    configPath: "/test/config.jsonc",
  };

  it("should instantiate ClaudeProvider", () => {
    const provider = AIFactory.getProvider({
      ...baseConfig,
      defaultProvider: "claude",
      providers: { claude: { model: "claude-3-7-sonnet" } },
    });
    assert.equal(provider.id, "claude");
    assert.equal(provider.name, "Claude Code CLI");
  });

  it("should instantiate CodexProvider", () => {
    const provider = AIFactory.getProvider({
      ...baseConfig,
      defaultProvider: "codex",
      providers: { codex: { model: "gpt-5.6-sol", ephemeral: true } },
    });
    assert.equal(provider.id, "codex");
    assert.equal(provider.name, "OpenAI Codex CLI");
  });

  it("should instantiate PiProvider", () => {
    const provider = AIFactory.getProvider({
      ...baseConfig,
      defaultProvider: "pi",
      providers: { pi: { model: "claude-3-5-sonnet" } },
    });
    assert.equal(provider.id, "pi");
    assert.equal(provider.name, "Pi Coding Agent");
  });

  it("should instantiate OllamaProvider", () => {
    const provider = AIFactory.getProvider({
      ...baseConfig,
      defaultProvider: "ollama",
      providers: { ollama: { model: "qwen2.5-coder" } },
    });
    assert.equal(provider.id, "ollama");
    assert.equal(provider.name, "Ollama Local LLM");
  });

  it("should instantiate AiderProvider", () => {
    const provider = AIFactory.getProvider({
      ...baseConfig,
      defaultProvider: "aider",
      providers: { aider: { model: "gpt-4o" } },
    });
    assert.equal(provider.id, "aider");
    assert.equal(provider.name, "Aider AI");
  });

  it("should instantiate CustomProvider", () => {
    const provider = AIFactory.getProvider({
      ...baseConfig,
      defaultProvider: "custom",
      providers: { custom: { command: "my-llm-cli", args: ["--prompt"] } },
    });
    assert.equal(provider.id, "custom");
    assert.equal(provider.name, "Custom CLI Harness");
  });
});
