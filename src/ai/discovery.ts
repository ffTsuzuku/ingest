import { executeCommand } from "../utils/command.js";
import { ANSI } from "../tui/ansi.js";

export interface HarnessSpec {
  id: string;
  name: string;
  binary: string;
  checkArgs: string[];
  description: string;
  recommended?: boolean;
}

export interface DiscoveredHarness extends HarnessSpec {
  available: boolean;
  version?: string;
}

export const KNOWN_HARNESSES: HarnessSpec[] = [
  {
    id: "antigravity",
    name: "Antigravity CLI (agy)",
    binary: "agy",
    checkArgs: ["--help"],
    description: "Session-native Google Antigravity CLI (zero token setup)",
    recommended: true,
  },
  {
    id: "claude",
    name: "Claude Code CLI",
    binary: "claude",
    checkArgs: ["--version"],
    description: "Anthropic Claude Code agent harness (claude -p)",
  },
  {
    id: "codex",
    name: "OpenAI Codex CLI",
    binary: "codex",
    checkArgs: ["--version"],
    description: "OpenAI Codex CLI runner (codex exec)",
  },
  {
    id: "pi",
    name: "Pi Coding Agent",
    binary: "pi",
    checkArgs: ["--version"],
    description: "Pi minimalist terminal coding agent (pi -p)",
  },
  {
    id: "opencode",
    name: "Opencode CLI",
    binary: "opencode",
    checkArgs: ["--version"],
    description: "Multi-provider agent harness (OpenAI, DeepSeek, Ollama, LM Studio)",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    binary: "gemini",
    checkArgs: ["--version"],
    description: "Google Gemini developer CLI tool adapter",
  },
  {
    id: "ollama",
    name: "Ollama Local LLM",
    binary: "ollama",
    checkArgs: ["--version"],
    description: "Local model runner (offline/private Llama, Qwen, Mistral)",
  },
  {
    id: "aider",
    name: "Aider AI",
    binary: "aider",
    checkArgs: ["--version"],
    description: "AI pair programming CLI and repo analyzer",
  },
  {
    id: "gh-copilot",
    name: "GitHub Copilot CLI",
    binary: "gh",
    checkArgs: ["copilot", "--version"],
    description: "GitHub Copilot CLI extension adapter",
  },
];

export class HarnessDiscovery {
  public static async probeHarness(spec: HarnessSpec, timeoutMs = 1500): Promise<DiscoveredHarness> {
    try {
      const res = await executeCommand(spec.binary, spec.checkArgs, { timeoutMs });
      if (res.exitCode === 0) {
        const rawOutput = (res.stdout || res.stderr).split("\n")[0] || "";
        const versionMatch = rawOutput.match(/\bv?\d+\.\d+(\.\d+)?(-\S+)?\b/);
        const version = versionMatch ? versionMatch[0] : undefined;
        return {
          ...spec,
          available: true,
          version,
        };
      }
    } catch {
      // Ignored: binary not found in PATH or check failed
    }

    return {
      ...spec,
      available: false,
    };
  }

  public static async discoverAll(timeoutMs = 1500): Promise<DiscoveredHarness[]> {
    const probes = KNOWN_HARNESSES.map((spec) => this.probeHarness(spec, timeoutMs));
    const results = await Promise.all(probes);

    // Sort: Available first, then recommended, then name
    return results.sort((a, b) => {
      if (a.available && !b.available) return -1;
      if (!a.available && b.available) return 1;
      if (a.recommended && !b.recommended) return -1;
      if (!a.recommended && b.recommended) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  public static async getDetectedDefault(): Promise<string> {
    const discovered = await this.discoverAll();
    const available = discovered.find((d) => d.available);
    return available ? available.id : "antigravity";
  }

  public static buildMenuChoices(
    discovered: DiscoveredHarness[],
    activeProviderId?: string,
  ): Array<{ label: string; value: string; hint: string; selected?: boolean }> {
    const choices = discovered.map((h) => {
      const statusBadge = h.available
        ? `${ANSI.green}[Detected ✔]${ANSI.reset}`
        : `${ANSI.dim}[Not in PATH]${ANSI.reset}`;

      const verText = h.version ? ` (v${h.version})` : "";
      const isSelected = activeProviderId ? h.id === activeProviderId : h.available && h.recommended;

      return {
        label: `${h.available ? "✔" : " "} ${h.name}${verText} ${statusBadge}`,
        value: h.id,
        hint: h.description,
        selected: isSelected,
      };
    });

    choices.push({
      label: `➕ Custom Agent / CLI Harness`,
      value: "custom",
      hint: "Specify a custom binary, arguments, or environment variables",
      selected: activeProviderId === "custom",
    });

    return choices;
  }
}
