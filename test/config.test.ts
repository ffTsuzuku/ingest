import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stripJsonComments, parseJsonc } from "../src/config/parser.js";
import {
  ConfigManager,
  expandHome,
  resolveConfiguredPath,
  findLocalConfigPath,
  loadLocalConfig,
  mergeRepoWithLocalConfig,
} from "../src/config/manager.js";

describe("JSONC Parser", () => {
  it("should strip single-line comments", () => {
    const raw = `{\n  // single line comment\n  "key": "value"\n}`;
    const parsed = parseJsonc<{ key: string }>(raw);
    assert.equal(parsed.key, "value");
  });

  it("should strip block comments", () => {
    const raw = `{\n  /* block\n   comment */\n  "count": 42\n}`;
    const parsed = parseJsonc<{ count: number }>(raw);
    assert.equal(parsed.count, 42);
  });

  it("should preserve strings containing comment characters", () => {
    const raw = `{\n  "url": "http://localhost:1234/v1//test/*abc*/"\n}`;
    const parsed = parseJsonc<{ url: string }>(raw);
    assert.equal(parsed.url, "http://localhost:1234/v1//test/*abc*/");
  });

  it("should handle trailing commas in objects and arrays", () => {
    const raw = `{\n  "arr": [1, 2, 3,],\n  "nested": { "a": 1, },\n}`;
    const parsed = parseJsonc<{ arr: number[]; nested: { a: number } }>(raw);
    assert.deepEqual(parsed.arr, [1, 2, 3]);
    assert.equal(parsed.nested.a, 1);
  });
});

describe("Path Resolution", () => {
  it("should expand home directory paths", () => {
    const expanded = expandHome("~/reports");
    assert.ok(!expanded.startsWith("~"));
    assert.ok(expanded.endsWith("reports"));
  });

  it("should keep absolute paths untouched", () => {
    const resolved = resolveConfiguredPath("/Users/tsuzuku/reports");
    assert.equal(resolved, "/Users/tsuzuku/reports");
  });
});

describe("Local Repository Configuration", () => {
  it("should find and load .ingestrc file in repo directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "ingest-test-"));
    try {
      const configPath = join(tempDir, ".ingestrc");
      await writeFile(
        configPath,
        `// Local repo config\n{\n  "repo_name": "test-repo",\n  "branches": ["main", "feature/v1"],\n  "custom_prompt": "Custom prompt for test",\n  "diff_mode": false,\n  "max_diff_lines": 500\n}\n`,
        "utf8",
      );

      const foundPath = await findLocalConfigPath(tempDir);
      assert.equal(foundPath, configPath);

      const loaded = await loadLocalConfig(tempDir);
      assert.ok(loaded);
      assert.equal(loaded?.repo_name, "test-repo");
      assert.deepEqual(loaded?.branches, ["main", "feature/v1"]);
      assert.equal(loaded?.custom_prompt, "Custom prompt for test");
      assert.equal(loaded?.diff_mode, false);
      assert.equal(loaded?.max_diff_lines, 500);

      const merged = await mergeRepoWithLocalConfig(
        { path: tempDir, branches: ["master"], diff_mode: true },
        tempDir,
      );
      assert.equal(merged.repo_name, "test-repo");
      assert.deepEqual(merged.branches, ["main", "feature/v1"]);
      assert.equal(merged.custom_prompt, "Custom prompt for test");
      assert.equal(merged.diff_mode, false);
      assert.equal(merged.max_diff_lines, 500);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("should find ingest.config.jsonc and override app config when loaded in cwd", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "ingest-test-"));
    try {
      const configPath = join(tempDir, "ingest.config.jsonc");
      await writeFile(
        configPath,
        `{\n  "default_provider": "opencode",\n  "prompt": "Local project prompt override",\n  "output_root": "./custom-reports"\n}\n`,
        "utf8",
      );

      const foundPath = await findLocalConfigPath(tempDir);
      assert.equal(foundPath, configPath);

      const loadedConfig = await ConfigManager.load(undefined, tempDir);
      assert.equal(loadedConfig.defaultProvider, "opencode");
      assert.equal(loadedConfig.prompt, "Local project prompt override");
      assert.ok(loadedConfig.outputRoot.endsWith("custom-reports"));
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

