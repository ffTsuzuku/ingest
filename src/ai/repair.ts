import type { AIProvider } from "./types.js";
import { getLocalDateString } from "../utils/date.js";

export function buildMermaidRepairPrompt(mermaidCode: string): string {
  return `You are a Mermaid diagram syntax specialist.
The following Mermaid diagram failed to parse or contains syntax errors.

Input Diagram:
\`\`\`mermaid
${mermaidCode.trim()}
\`\`\`

Your Task:
Fix all syntax errors in the Mermaid diagram and output ONLY the corrected diagram inside a single \`\`\`mermaid ... \`\`\` code block.

Strict Rules:
1. Double-quote all node labels containing special characters, brackets, parentheses, colons, slashes, or whitespace:
   - Correct: NodeA["CLI Parser (src/index.ts)"]
   - Incorrect: NodeA[CLI Parser (src/index.ts)]
   - Correct: NodeB["Engine v2.0 & Storage"]
   - Incorrect: NodeB[Engine v2.0 & Storage]
2. Node IDs must be valid alphanumeric or underscore strings (e.g. CLI_Entry, SubsystemA). Never use dots, slashes, or dashes inside node IDs.
3. Use valid Mermaid connectors: \`-->\`, \`-->|"label"|\`, \`-.->\`, \`==>\`, \`-- "label" -->\`.
4. Ensure all subgraphs have a matching \`end\`.
5. Start with \`flowchart TD\` (or \`graph TD\`, \`sequenceDiagram\`, etc. matching the original intent).
6. Do NOT include explanatory notes, apologies, or markdown text outside the \`\`\`mermaid code fence. Output ONLY the code block.`;
}

export function buildFullReportMermaidRepairPrompt(markdown: string): string {
  return `You are a systems architect and Mermaid diagram expert.
Inspect the following markdown engineering report and fix/improve any broken or invalid Mermaid diagrams (or convert ASCII architecture diagrams under "Architecture & System Map" into valid Mermaid \`flowchart TD\` blocks).

Markdown Document:
${markdown}

Rules:
1. Fix all Mermaid diagram syntax errors. Ensure every node label with parentheses, brackets, colons, or punctuation is enclosed in double quotes: e.g. \`A["Label (info)"]\`.
2. Ensure valid node IDs (alphanumeric and underscores only).
3. Preserve all other markdown sections, commit history, tables, and text exactly as they are.
4. Output the complete, corrected Markdown document.`;
}

export function extractMermaidFromResponse(response: string): string | null {
  const match = response.match(/```(?:mermaid)?\s*([\s\S]*?)```/i);
  if (match && match[1]) {
    const code = match[1].trim();
    if (code.length > 0) {
      return code;
    }
  }

  const trimmed = response.trim();
  if (/^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph)\b/i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export async function repairMermaidDiagram(
  mermaidCode: string,
  provider: AIProvider,
  cwd?: string,
): Promise<string> {
  const prompt = buildMermaidRepairPrompt(mermaidCode);

  let rawResponse = "";
  if (typeof provider.generate === "function") {
    rawResponse = await provider.generate(prompt, cwd);
  } else {
    // Fallback through analyze interface
    const res = await provider.analyze({
      repoName: "diagram-repair",
      repoPath: cwd || process.cwd(),
      branches: ["main"],
      dateStr: getLocalDateString(),
      commits: [],
      basePrompt: prompt,
      customPrompt: prompt,
    });
    rawResponse = res.content;
  }

  const extracted = extractMermaidFromResponse(rawResponse);
  if (!extracted) {
    throw new Error("AI provider did not return a valid Mermaid diagram code block.");
  }

  return extracted;
}

export async function repairReportMarkdown(
  markdownContent: string,
  provider: AIProvider,
  cwd?: string,
): Promise<{ repairedMarkdown: string; repairedCount: number }> {
  // Check if there are mermaid blocks
  const mermaidBlockRegex = /```mermaid\s*([\s\S]*?)```/gi;
  const matches = Array.from(markdownContent.matchAll(mermaidBlockRegex));

  if (matches.length > 0) {
    let updated = markdownContent;
    let repairedCount = 0;

    for (const match of matches) {
      const fullMatch = match[0];
      const code = match[1]?.trim() || "";
      if (!code) continue;

      try {
        const fixedCode = await repairMermaidDiagram(code, provider, cwd);
        updated = updated.replace(fullMatch, "```mermaid\n" + fixedCode + "\n```");
        repairedCount++;
      } catch {
        // If single diagram repair fails, continue to next
      }
    }

    if (repairedCount > 0) {
      return { repairedMarkdown: updated, repairedCount };
    }
  }

  // If no explicit mermaid block or individual repair didn't change, try full report inspection
  const prompt = buildFullReportMermaidRepairPrompt(markdownContent);
  let rawResponse = "";
  if (typeof provider.generate === "function") {
    rawResponse = await provider.generate(prompt, cwd);
  } else {
    const res = await provider.analyze({
      repoName: "report-repair",
      repoPath: cwd || process.cwd(),
      branches: ["main"],
      dateStr: getLocalDateString(),
      commits: [],
      basePrompt: prompt,
      customPrompt: prompt,
    });
    rawResponse = res.content;
  }

  const cleaned = rawResponse.trim();
  if (cleaned.startsWith("# ") || cleaned.includes("## Architecture")) {
    return { repairedMarkdown: cleaned, repairedCount: 1 };
  }

  return { repairedMarkdown: markdownContent, repairedCount: 0 };
}
