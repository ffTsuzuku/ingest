import { readFile } from "node:fs/promises";
import type { AnalysisContext } from "./types.js";
import { resolveConfiguredPath } from "../config/manager.js";

export async function resolveRepoPrompt(
  basePrompt: string,
  customPrompt?: string | null,
  customPromptFile?: string | null,
  repoPath?: string,
): Promise<string> {
  if (customPromptFile) {
    try {
      const resolvedPath = resolveConfiguredPath(customPromptFile, repoPath);
      const fileContent = await readFile(resolvedPath, "utf8");
      if (fileContent.trim().length > 0) {
        return fileContent.trim();
      }
    } catch {
      // Fallback
    }
  }

  if (customPrompt && customPrompt.trim().length > 0) {
    return customPrompt.trim();
  }

  return basePrompt;
}

export function buildAnalysisPrompt(context: AnalysisContext): string {
  const commitDetails = context.commits
    .map((c, idx) => {
      const filesStr = c.filesChanged.length > 0 ? `\n  Files: ${c.filesChanged.slice(0, 15).join(", ")}` : "";
      const bodyStr = c.body ? `\n  Body: ${c.body.slice(0, 500)}` : "";
      return `Commit ${idx + 1} [${c.hash.slice(0, 8)}] (${c.branch}):
  Author: ${c.author} <${c.email}>
  Timestamp: ${c.timestamp}
  Subject: ${c.subject}${bodyStr}${filesStr}`;
    })
    .join("\n\n");

  let diffSection = "";
  if (context.diffStat) {
    const fileStatsList = context.diffStat.fileStats
      .slice(0, 20)
      .map((f) => `  - ${f.path}: +${f.insertions}, -${f.deletions}`)
      .join("\n");

    const patchSection = context.diffStat.diffPatches
      ? `\n\nCode Diff Patches (Key Changes & Implementation Details):\n\`\`\`diff\n${context.diffStat.diffPatches}\n\`\`\``
      : "";

    diffSection = `\n\n### Diff Deep-Dive Statistics:
- Total Files Changed: ${context.diffStat.filesChangedCount}
- Total Insertions: +${context.diffStat.insertions}
- Total Deletions: -${context.diffStat.deletions}
Top Modified Files:
${fileStatsList}${patchSection}`;
  }

  const promptDirective = context.customPrompt || context.basePrompt;

  return `You are an expert software engineer and tech lead generating a daily technical report for a codebase.

Context:
- Repository: ${context.repoName}
- Date: ${context.dateStr}
- Branches analyzed: ${context.branches.join(", ")}
- Total commits: ${context.commits.length}

User Instructions:
${promptDirective}

Git Commit & Code Diff Data:
${commitDetails}${diffSection}

Guidelines for the Technical Report:
1. **Explain the Implementation Mechanics**: Do NOT merely parrot commit subjects or file names. Use the commit messages and code diff patches to explain *how* logic was implemented, *what* algorithms, modules, classes, or interfaces changed, and *why* specific architectural decisions were made.
2. **Deep Technical Breakdown**: Group changes logically by architectural component/subsystem. Explain the problem, the solution, and before-vs-after behavior.
3. **Professional & Clean Formatting**: Write clear, insightful Markdown with standard sections.

Please produce a comprehensive engineering summary following this structure:

# ${context.repoName} - ${context.dateStr}

## Executive Summary
<A concise overview of the day's engineering accomplishments, architectural trajectory, and major technical themes.>

## Key Architectural & Implementation Changes
### <Component / Subsystem Name>
- **What Changed**: Detailed explanation of the technical changes made to files and modules.
- **Why & How**: The rationale, design choices, and implementation mechanics (mention specific functions, classes, APIs, or files touched).
- **Impact**: How this affects performance, developer experience, security, or stability.

## Commit Breakdown
- [\`<hash>\`] **<Subject>** (*<Author>*)
  - **Implementation**: Technical explanation of what code was altered and why.
  - **Files**: List of key modified files with (+/-) stats.

## Impact & Risk Assessment
- **Breaking Changes / Deprecations**: (None or list)
- **Configuration & Dependency Updates**: (None or list)
- **Testing & Quality Assurance**: (Summary of tests added/updated)

## Contributors
<Contributor summary formatted cleanly with author names, email, and lines added/deleted>
`;
}
