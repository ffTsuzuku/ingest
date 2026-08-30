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
    reportStyle: context.reportStyle,
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
    providerLabel: "ingest:none",
    commitCount: 0,
    reportStyle: context.reportStyle,
  };

  const markdown = `# ${context.repoName} - ${context.dateStr}

## Executive Summary
No commit activity recorded in the specified time window.

## Key Architectural & Implementation Changes
No code changes detected.

## Commit Breakdown
None.

## Impact & Risk Assessment
No changes to configuration, APIs, or dependencies.

## Contributors
None

---
*Generated on ${generatedAt} (0 commits analyzed across branches: ${context.branches.join(", ")})*
`;

  return { markdown, meta };
}
