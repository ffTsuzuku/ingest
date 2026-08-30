import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigInitWizard, PROMPT_PRESETS } from "../src/config/init.js";
import { parseJsonc } from "../src/config/parser.js";
import type { LocalRepoConfig } from "../src/config/types.js";

describe("Configuration Init Wizard", () => {
  it("should have prompt presets defined", () => {
    assert.ok(PROMPT_PRESETS.length >= 3);
    assert.ok(PROMPT_PRESETS.some((p) => p.label.includes("Engineering Deep Dive")));
    assert.ok(PROMPT_PRESETS.some((p) => p.label.includes("Changelog")));
    assert.ok(PROMPT_PRESETS.some((p) => p.label.includes("Security")));
  });

  it("should run quick init in a local repo and produce valid .ingestrc", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "ingest-init-test-"));
    try {
      const createdPath = await ConfigInitWizard.run({
        quick: true,
        local: true,
        cwd: tempDir,
      });

      assert.ok(createdPath);
      assert.equal(createdPath, join(tempDir, ".ingestrc"));

      const content = await readFile(createdPath, "utf8");
      const parsed = parseJsonc<LocalRepoConfig>(content);

      assert.ok(parsed);
      assert.equal(parsed.default_provider, "antigravity");
      assert.equal(parsed.diff_mode, true);
      assert.equal(parsed.max_diff_lines, 200);
      assert.ok(Array.isArray(parsed.branches));
      assert.ok(parsed.prompt && parsed.prompt.length > 0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("should run guided init in non-interactive mode and create config with defaults", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "ingest-init-guided-"));
    try {
      const createdPath = await ConfigInitWizard.run({
        quick: false,
        local: true,
        cwd: tempDir,
      });

      assert.ok(createdPath);
      assert.equal(createdPath, join(tempDir, ".ingestrc"));

      const content = await readFile(createdPath, "utf8");
      const parsed = parseJsonc<LocalRepoConfig>(content);

      assert.ok(parsed);
      assert.equal(parsed.default_provider, "antigravity");
      assert.ok(parsed.branches && parsed.branches.length > 0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
