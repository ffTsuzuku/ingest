import { readFile } from "node:fs/promises";
import type { AnalysisContext } from "./types.js";
import { resolveConfiguredPath } from "../config/manager.js";

export const DEFAULT_PROMPT =
  "Perform an engineering deep dive into repo activity over the last 24h: architectural patterns, key implementation mechanics, code diff analysis, and technical impact.";

export const SYSTEM_CENTRIC_PROMPT =
  "Generate a system-centric developer report: explicit codebase map, subsystem boundaries, causal Problem → Change → Result analysis, before/after behavior changes, component interactions, and commit appendix.";

export const CHANGELOG_PROMPT =
  "Generate structured release changelog notes from repo commits: highlight user-facing features, critical bug fixes, breaking changes, and migration instructions.";

export const SECURITY_PROMPT =
  "Review git commits from a software security and risk perspective: audit sensitive logic changes, permission checks, dependency updates, and regression hazards.";

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

function formatCommitAndDiffData(context: AnalysisContext): { commitDetails: string; diffSection: string } {
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

  return { commitDetails, diffSection };
}

export function buildStandardAnalysisPrompt(context: AnalysisContext): string {
  const { commitDetails, diffSection } = formatCommitAndDiffData(context);
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
(Note: Provide each commit as its own dedicated H3 subsection with clear separation)

### \`<hash>\` - <Subject> (*<Author>*)
- **Implementation**: Technical explanation of what code was altered, APIs/algorithms changed, and architectural rationale.
- **Files**: List of key modified files with (+/-) stats.

## Impact & Risk Assessment
- **Breaking Changes / Deprecations**: (None or list)
- **Configuration & Dependency Updates**: (None or list)
- **Testing & Quality Assurance**: (Summary of tests added/updated)

## Contributors
<Contributor summary formatted cleanly with author names, email, and lines added/deleted>
`;
}

export function buildSystemCentricPrompt(context: AnalysisContext): string {
  const { commitDetails, diffSection } = formatCommitAndDiffData(context);
  const promptDirective = context.customPrompt || context.basePrompt;

  return `You are a principal software engineer and systems architect generating a system-centric, developer-first engineering report for a codebase.

Primary Goal:
"A developer reading this must confidently understand what changed, where it lives, why it changed, and what runtime/developer-facing behavior is altered."

Context:
- Repository: ${context.repoName}
- Date: ${context.dateStr}
- Branches analyzed: ${context.branches.join(", ")}
- Total commits: ${context.commits.length}

User Instructions:
${promptDirective}

Git Commit & Code Diff Data:
${commitDetails}${diffSection}

Core Guiding Principles for this System-Centric Report:
1. **System-Centric over Commit-Centric**: Group changes by architectural subsystem and module boundaries. The main report explains the architecture, while individual commits are preserved as an appendix audit trail.
2. **Where Does This Live?**: Introduce an explicit Codebase Map (directory tree with responsibilities) and a "Start Here" navigation table mapping subsystems to primary entry files.
3. **Causal Problem → Change → Result**: Every major change must explicitly follow the Problem (prior limitation/need) → Change (exact technical alteration) → Result (concrete capability/outcome) causal chain.
4. **Developer-Facing Behavior Changes**: Explicitly document before-vs-after behavior changes in a clear comparison table.
5. **Progressive Disclosure**:
   - Layer 1 (30-second summary): "At a Glance" metrics & "What Changed" bulleted summary with net effect.
   - Layer 2 (5-minute briefing): Architecture diagrams, causal breakdowns, behavior changes, new concepts, decisions, risks, and verification.
   - Layer 3 (Audit trail): Commit summary table and detailed commit breakdown in the Appendix.
6. **Objective & Concrete Language**: Use precise, defensible technical statements rather than subjective superlatives (e.g. state "Bounds report storage when retention cleanup runs" rather than "Guarantees robust bounded storage").
7. **Cross-Cutting Effects**: Highlight unchanged interfaces or downstream modules affected by subsystem changes.

Please produce a comprehensive engineering report following this EXACT structure:

# ${context.repoName} — Daily Engineering Report
${context.dateStr}

## At a Glance
- **Commits Analyzed**: ${context.commits.length} commits across branches: \`${context.branches.join(", ")}\`
- **Diff Scale**: <+insertions> / <-deletions> across <N> files (<net lines> net lines)
- **Primary Subsystems Touched**: <Subsystem 1, Subsystem 2, ...>
- **Breaking / Security Impact**: <None | Summary of key breaking or security notices>
- **Verification**: <Tests / Validation summary>

## What Changed
<Concise, high-signal bulleted summary of major changes introduced in this period>
- <Major Change 1>
- <Major Change 2>
- ...

**Net Effect**: <A single clear sentence explaining the overall operational and developer outcome.>

## Architecture & System Map

### Codebase Map
\`\`\`
src/
├── <subsystem_dir>/     <1-line description of responsibility>
└── <entrypoint>         <1-line description of responsibility>
\`\`\`

### System Architecture & Dependency Flow
\`\`\`
<ASCII or Mermaid diagram showing relationships between CLI, Subsystems, AI Provider/Services, and Storage/Schedulers>
\`\`\`

### How the Pieces Interact (Execution Flows)
#### <Primary Flow Name, e.g. Report Generation Flow>
\`\`\`
CLI / Invoker
  ↓
<Subsystem A>
  ↓
<Subsystem B>
  ↓
<Subsystem C>
\`\`\`

## Major Architectural & Implementation Changes

### 1. <Subsystem / Feature Name>
- **Problem**: <What was the limitation, bug, or operational friction before this change?>
- **Change**: <What exact architectural modification, interface, or algorithm was introduced?>
- **Result**: <What is the concrete capability or outcome resulting from this change?>
- **Where**: <List primary files and modules, e.g. \`src/config/manager.ts\`>
- **Behavior**: <How runtime execution, CLI options, or developer workflows change>
- **Cross-Cutting Effects**: <List downstream modules or interfaces affected by this change>

<Repeat for all major subsystems changed>

## Developer-Facing Behavior Changes
| Before | Now | Impact / Migration Notes |
| :--- | :--- | :--- |
| <Old behavior / command / config> | <New behavior / command / config> | <Operational impact> |

## New Concepts & Abstractions
- **<Concept / Class / Pattern Name>**: <Concise explanation of what this abstraction represents and why it was introduced.>

## Important Implementation Decisions
- **<Decision / Principle>**: <Rationale and architectural trade-offs behind this decision (e.g. zero runtime dependencies, provider isolation, remote-derived repo identity, self-expiring schedules).>

## Things to Watch & Risk Assessment
### High Attention
- <Security models, headless execution permissions, destructive actions like automated retention pruning>
### Medium Attention
- <Configuration precedence subtleties, automated schedule removal upon expiration, edge case behaviors>

## Verification & Quality Assurance
- **Test Evidence**: <Test suites added or verified, test counts, passing status>
- **Static Checks**: <Typecheck, build, doc verification, and lint validation performed>

## Codebase Navigation ("Start Here")
| Subsystem / Area | Start Here File | Primary Responsibility |
| :--- | :--- | :--- |
| <Area 1> | \`<file path>\` | <Responsibility> |
| <Area 2> | \`<file path>\` | <Responsibility> |

## Commit History
| Hash | Branch | Author | Summary | Subsystem |
| :--- | :--- | :--- | :--- | :--- |
| \`<hash>\` | \`<branch>\` | <Author> | <Subject> | <Area> |

---

# Appendix: Commit-Level Changes

## Detailed Commit Breakdown

### \`<hash>\` - <Subject> (*<Author>*)
- **Implementation**: <Technical explanation of what code was altered, APIs/algorithms changed, and rationale>
- **Files**: <List of modified files with (+/-) stats>
`;
}

export function buildAnalysisPrompt(context: AnalysisContext): string {
  const isSystemCentric =
    context.reportStyle === "system-centric" ||
    (typeof context.customPrompt === "string" &&
      (context.customPrompt === SYSTEM_CENTRIC_PROMPT ||
        context.customPrompt.toLowerCase().includes("system-centric") ||
        context.customPrompt.toLowerCase().includes("codebase map")));

  if (isSystemCentric) {
    return buildSystemCentricPrompt(context);
  }

  return buildStandardAnalysisPrompt(context);
}

