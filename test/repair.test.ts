import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractMermaidFromResponse,
  buildMermaidRepairPrompt,
  repairMermaidDiagram,
  repairReportMarkdown,
} from "../src/ai/repair.js";
import type { AIProvider, AnalysisContext, AnalysisResult } from "../src/ai/types.js";

describe("AI-Powered Mermaid Repair", () => {
  it("should extract mermaid code block from model response", () => {
    const rawResponse = `Here is the corrected diagram:
\`\`\`mermaid
flowchart TD
  A["CLI Entry (src/index.ts)"] --> B["Storage Engine"]
\`\`\`
Hope this helps!`;

    const extracted = extractMermaidFromResponse(rawResponse);
    assert.ok(extracted);
    assert.ok(extracted.includes("flowchart TD"));
    assert.ok(extracted.includes('A["CLI Entry (src/index.ts)"]'));
  });

  it("should construct clear repair instructions with quoting rules", () => {
    const broken = `flowchart TD\n  A[CLI (src/index.ts)] --> B`;
    const prompt = buildMermaidRepairPrompt(broken);
    assert.ok(prompt.includes("Mermaid diagram syntax specialist"));
    assert.ok(prompt.includes("Double-quote all node labels"));
    assert.ok(prompt.includes(broken));
  });

  it("should repair broken diagram using mock AI provider", async () => {
    const mockProvider: AIProvider = {
      id: "mock",
      name: "Mock Provider",
      isAvailable: async () => true,
      analyze: async (_ctx: AnalysisContext): Promise<AnalysisResult> => {
        return {
          content: "```mermaid\nflowchart TD\n  A[\"CLI (src/index.ts)\"] --> B[\"Engine\"]\n```",
          providerLabel: "mock",
        };
      },
      generate: async (_prompt: string): Promise<string> => {
        return "```mermaid\nflowchart TD\n  A[\"CLI (src/index.ts)\"] --> B[\"Engine\"]\n```";
      },
    };

    const fixed = await repairMermaidDiagram("flowchart TD\n  A[CLI (src/index.ts)] --> B[Engine]", mockProvider);
    assert.ok(fixed.includes('A["CLI (src/index.ts)"]'));
    assert.ok(fixed.includes('B["Engine"]'));
  });

  it("should repair report markdown containing mermaid block", async () => {
    const mockProvider: AIProvider = {
      id: "mock",
      name: "Mock Provider",
      isAvailable: async () => true,
      analyze: async (_ctx: AnalysisContext): Promise<AnalysisResult> => {
        return {
          content: "```mermaid\nflowchart TD\n  A[\"Fixed Node\"] --> B\n```",
          providerLabel: "mock",
        };
      },
      generate: async (_prompt: string): Promise<string> => {
        return "```mermaid\nflowchart TD\n  A[\"Fixed Node\"] --> B\n```";
      },
    };

    const inputMarkdown = `# Report\n\n\`\`\`mermaid\nflowchart TD\n  A[Broken Node] --> B\n\`\`\``;
    const res = await repairReportMarkdown(inputMarkdown, mockProvider);

    assert.equal(res.repairedCount, 1);
    assert.ok(res.repairedMarkdown.includes('A["Fixed Node"]'));
  });
});
