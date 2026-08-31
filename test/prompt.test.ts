import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAnalysisPrompt, resolveRepoPrompt } from "../src/ai/prompt.js";
import { AIFactory } from "../src/ai/factory.js";
import { promptSelect, promptConfirm, promptText, promptMultiSelect, pathCompleter, createPathCompleter } from "../src/tui/prompt.js";
import type { AppConfig } from "../src/config/types.js";

describe("AI Prompt Builder", () => {
  it("should format prompt with commit information and diff statistics", () => {
    const prompt = buildAnalysisPrompt({
      repoName: "test-repo",
      repoPath: "/path/to/repo",
      branches: ["main"],
      dateStr: "2026-04-05",
      commits: [
        {
          hash: "abc123456789",
          author: "Alice Developer",
          email: "alice@example.com",
          timestamp: "2026-04-05T10:00:00Z",
          subject: "feat: add oauth authentication",
          body: "Implemented oauth flow with refresh tokens",
          branch: "main",
          filesChanged: ["src/auth.ts", "test/auth.test.ts"],
        },
      ],
      diffStat: {
        filesChangedCount: 2,
        insertions: 50,
        deletions: 10,
        fileStats: [{ path: "src/auth.ts", insertions: 50, deletions: 10 }],
        diffSummary: "src/auth.ts | 60 +++++-",
        diffPatches: "@@ -1,5 +1,6 @@\n+export function login() {}",
      },
      basePrompt: "Default base prompt",
    });

    assert.ok(prompt.includes("test-repo"));
    assert.ok(prompt.includes("Alice Developer"));
    assert.ok(prompt.includes("feat: add oauth authentication"));
    assert.ok(prompt.includes("Diff Deep-Dive Statistics"));
    assert.ok(prompt.includes("+50, -10"));
    assert.ok(prompt.includes("export function login()"));
    assert.ok(prompt.includes("Executive Summary"));
    assert.ok(prompt.includes("Key Architectural & Implementation Changes"));
  });

  it("should format system-centric prompt with codebase map and causal Problem->Change->Result", () => {
    const prompt = buildAnalysisPrompt({
      repoName: "test-system-repo",
      repoPath: "/path/to/system-repo",
      branches: ["main"],
      dateStr: "2026-08-30",
      commits: [
        {
          hash: "def456789012",
          author: "Bob Architect",
          email: "bob@example.com",
          timestamp: "2026-08-30T14:00:00Z",
          subject: "feat: modularize ai provider factory",
          body: "Separated provider logic behind unified interface",
          branch: "main",
          filesChanged: ["src/ai/factory.ts", "src/ai/antigravity.ts"],
        },
      ],
      diffStat: {
        filesChangedCount: 2,
        insertions: 120,
        deletions: 30,
        fileStats: [{ path: "src/ai/factory.ts", insertions: 80, deletions: 10 }],
        diffSummary: "src/ai/factory.ts | 90 ++++++++-",
        diffPatches: "@@ -1,5 +1,10 @@\n+export class AIFactory {}",
      },
      basePrompt: "Default base prompt",
      reportStyle: "system-centric",
    });

    assert.ok(prompt.includes("test-system-repo"));
    assert.ok(prompt.includes("Bob Architect"));
    assert.ok(prompt.includes("Codebase Map"));
    assert.ok(prompt.includes("System Architecture & Dependency Flow"));
    assert.ok(prompt.includes("```mermaid"));
    assert.ok(prompt.includes("flowchart TD"));
    assert.ok(prompt.includes("**Problem**:"));
    assert.ok(prompt.includes("**Change**:"));
    assert.ok(prompt.includes("**Result**:"));
    assert.ok(prompt.includes("Developer-Facing Behavior Changes"));
    assert.ok(prompt.includes("Codebase Navigation"));
    assert.ok(prompt.includes("Appendix: Commit-Level Changes"));
  });

  it("should prioritize customPrompt over basePrompt", async () => {
    const prompt = await resolveRepoPrompt("Base prompt", "Custom repo prompt override");
    assert.equal(prompt, "Custom repo prompt override");
  });
});

describe("AI Factory", () => {
  it("should return AntigravityProvider for antigravity and agy", () => {
    const config: AppConfig = {
      repos: [],
      outputRoot: "/tmp/reports",
      rawOutputRoot: "/tmp/reports",
      retentionDays: 30,
      errorLogPath: "/tmp/error.log",
      defaultProvider: "antigravity",
      providers: {
        antigravity: { dangerously_skip_permissions: true },
      },
      prompt: "test",
      configPath: "/tmp/config.jsonc",
    };

    const provider = AIFactory.getProvider(config);
    assert.equal(provider.id, "antigravity");
    assert.ok(provider.name.includes("Antigravity"));
  });
});

describe("TUI Prompts & Path Autocompletion", () => {
  it("should return first choice in non-interactive / test mode", async () => {
    const res = await promptSelect({
      message: "Select an option:",
      choices: [
        { label: "Option 1", value: "opt1" },
        { label: "Option 2", value: "opt2" },
      ],
    });
    assert.equal(res, "opt1");
  });

  it("should handle promptConfirm without y/n input in non-interactive mode", async () => {
    const resYes = await promptConfirm({
      message: "Continue?",
      defaultYes: true,
    });
    assert.equal(resYes, true);

    const resNo = await promptConfirm({
      message: "Continue?",
      defaultYes: false,
    });
    assert.equal(resNo, false);
  });

  it("should handle promptText in non-interactive mode", async () => {
    const res = await promptText({
      message: "Enter path:",
      defaultValue: "/default/path",
      completer: "path",
    });
    assert.equal(res, "/default/path");
  });

  it("should autocomplete tilde to home directory slash", () => {
    const [hits, partial] = pathCompleter("~");
    assert.deepEqual(hits, ["~/"]);
    assert.equal(partial, "~");
  });

  it("should autocomplete relative directories and append trailing slash", () => {
    const [hits, partial] = pathCompleter("src/t");
    assert.equal(partial, "t");
    assert.ok(hits.includes("tui/"));
  });

  it("should autocomplete files and folders in directory", () => {
    const [hits, partial] = pathCompleter("src/tui/p");
    assert.equal(partial, "p");
    assert.ok(hits.includes("prompt.ts"));
    assert.ok(hits.includes("pager.ts"));
  });

  it("should filter to directories only when directoriesOnly is enabled", () => {
    const dirCompleter = createPathCompleter({ directoriesOnly: true });
    const [hits] = dirCompleter("src/");
    assert.ok(hits.includes("tui/"));
    assert.ok(!hits.includes("index.ts"));
  });

  it("should ignore hidden dotfiles unless prefix starts with a dot", () => {
    const [hitsNormal] = pathCompleter("");
    assert.ok(!hitsNormal.some((h) => h.startsWith(".")));

    const [hitsHidden, partial] = pathCompleter(".g");
    assert.equal(partial, ".g");
    assert.ok(hitsHidden.some((h) => h.startsWith(".g")));
  });

  it("should handle non-existent directories gracefully", () => {
    const [hits, partial] = pathCompleter("invalid/directory/path/here/foo");
    assert.deepEqual(hits, []);
    assert.equal(partial, "foo");
  });

  it("should handle promptMultiSelect in non-interactive mode returning selected choices", async () => {
    const res = await promptMultiSelect({
      message: "Select branches:",
      choices: [
        { label: "main", value: "main", selected: true },
        { label: "feature/1", value: "feature/1", selected: false },
        { label: "feature/2", value: "feature/2", selected: true },
      ],
    });
    assert.deepEqual(res, ["main", "feature/2"]);
  });

  it("should handle promptMultiSelect fallback to first item if none pre-selected", async () => {
    const res = await promptMultiSelect({
      message: "Select branches:",
      choices: [
        { label: "main", value: "main", selected: false },
        { label: "dev", value: "dev", selected: false },
      ],
    });
    assert.deepEqual(res, ["main"]);
  });
});


