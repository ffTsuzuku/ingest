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
      const filesStr = c.filesChanged.length > 0 ? `\n  Files: ${c.filesChanged.slice(0, 10).join(", ")}` : "";
      const bodyStr = c.body ? `\n  Body: ${c.body.slice(0, 300)}` : "";
      return `Commit ${idx + 1} [${c.hash.slice(0, 8)}] (${c.branch}):
  Author: ${c.author} <${c.email}>
  Timestamp: ${c.timestamp}
  Subject: ${c.subject}${bodyStr}${filesStr}`;
    })
    .join("\n\n");

  let diffSection = "";
  if (context.diffStat) {
    const fileStatsList = context.diffStat.fileStats
      .slice(0, 15)
      .map((f) => `  - ${f.path}: +${f.insertions}, -${f.deletions}`)
      .join("\n");

    diffSection = `\n\n### Diff Deep-Dive Statistics:
- Total Files Changed: ${context.diffStat.filesChangedCount}
- Total Insertions: +${context.diffStat.insertions}
- Total Deletions: -${context.diffStat.deletions}
Top Modified Files:
${fileStatsList}`;
  }

  const promptDirective = context.customPrompt || context.basePrompt;

  return `You are analyzing git commit activity for a repository daily report.

Context:
- Repository: ${context.repoName}
- Date: ${context.dateStr}
- Branches analyzed: ${context.branches.join(", ")}
- Total commits: ${context.commits.length}

User Prompt Instructions:
${promptDirective}

Git Activity Data:
${commitDetails}${diffSection}

Please produce a comprehensive, well-structured Markdown summary following this structure:

# ${context.repoName} - ${context.dateStr}

## Commit Summary
- Who: Author Name <email>
  What: Summary of commit
  Files: List top affected files (+/- changes)

## Key Changes
**Feature Additions:**
- ...
**Bug Fixes:**
- ...
**Refactoring & Chores:**
- ...

## Contributors
<Comma-separated authors sorted by contribution volume>

## Overall Narrative
<A cohesive 2-4 sentence paragraph highlighting key themes, major features, architectural patterns, and notable fixes.>
`;
}
