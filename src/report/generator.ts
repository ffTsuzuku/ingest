import type { AnalysisContext, AnalysisResult } from "../ai/types.js";
import type { ReportMeta } from "./types.js";

export function formatReportMarkdown(
  context: AnalysisContext,
  result: AnalysisResult,
): { markdown: string; meta: ReportMeta } {
  const generatedAt = new Date().toISOString();
  const meta: ReportMeta = {
    repoName: context.repoName,
    repoPath: context.repoPath,
    branches: context.branches,
    dateStr: context.dateStr,
    generatedAt,
    providerLabel: result.providerLabel,
    commitCount: context.commits.length,
  };

  let content = result.content.trim();

  // If content does not begin with header, add title header
  if (!content.startsWith("# ")) {
    content = `# ${context.repoName} - ${context.dateStr}\n\n${content}`;
  }

  // Append footer metadata comment
  const footer = `\n\n---\n*Generated on ${generatedAt} via \`${result.providerLabel}\` (${context.commits.length} commits analyzed across branches: ${context.branches.join(", ")})*\n`;

  return {
    markdown: content + footer,
    meta,
  };
}

export function generateEmptyReport(context: AnalysisContext): { markdown: string; meta: ReportMeta } {
  const generatedAt = new Date().toISOString();
  const meta: ReportMeta = {
    repoName: context.repoName,
    repoPath: context.repoPath,
    branches: context.branches,
    dateStr: context.dateStr,
    generatedAt,
    providerLabel: "git-ingest:none",
    commitCount: 0,
  };

  const markdown = `# ${context.repoName} - ${context.dateStr}

## Commit Summary
No commit activity recorded in the specified time window.

## Key Changes
No code changes detected.

## Contributors
None

## Overall Narrative
The repository had no active commit activity during this reporting window.

---
*Generated on ${generatedAt} (0 commits analyzed across branches: ${context.branches.join(", ")})*
`;

  return { markdown, meta };
}
