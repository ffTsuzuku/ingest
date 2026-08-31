import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isNoisyFile,
  matchesCustomIgnore,
  getFilePriority,
  fetchDiffPatches,
  fetchDiffStat,
} from "../src/git/diff.js";
import { runGit } from "../src/git/runner.js";
import { ConfigManager } from "../src/config/manager.js";

describe("Smart Diff Noise Filtering", () => {
  it("should filter common package manager lockfiles in root and nested paths", () => {
    const lockfiles = [
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "Cargo.lock",
      "go.sum",
      "composer.lock",
      "Gemfile.lock",
      "flake.lock",
      "poetry.lock",
      "Pipfile.lock",
      "bun.lockb",
      "bun.lock",
      "mix.lock",
      "pubspec.lock",
      "packages.lock.json",
      "subproject/package-lock.json",
      "apps/web/yarn.lock",
      "crates/core/Cargo.lock",
    ];

    for (const file of lockfiles) {
      assert.equal(isNoisyFile(file, [], true), true, "Expected " + file + " to be filtered");
    }
  });

  it("should filter build artifacts, bundles, maps, and compiler caches", () => {
    const buildFiles = [
      "dist/bundle.min.js",
      "style.min.css",
      "app.bundle.js",
      "vendor.bundle.css",
      "dist/app.js.map",
      "dist/index.d.ts.map",
      ".tsbuildinfo",
      "tsconfig.tsbuildinfo",
      "src/__snapshots__/component.test.tsx.snap",
      "tests/snapshot.snapshot",
      "test.snap.json",
    ];

    for (const file of buildFiles) {
      assert.equal(isNoisyFile(file, [], true), true, "Expected " + file + " to be filtered");
    }
  });

  it("should filter binary assets, media, fonts, archives, and compiled binaries", () => {
    const binaryFiles = [
      "assets/logo.png",
      "public/hero.jpg",
      "static/icon.svg",
      "favicon.ico",
      "images/banner.webp",
      "audio/click.mp3",
      "video/demo.mp4",
      "fonts/inter.woff2",
      "fonts/roboto.ttf",
      "bin/app.wasm",
      "docs/manual.pdf",
      "release/archive.tar.gz",
      "dist/bundle.zip",
      "lib/native.dylib",
      "target/release/binary.exe",
    ];

    for (const file of binaryFiles) {
      assert.equal(isNoisyFile(file, [], true), true, "Expected " + file + " to be filtered");
    }
  });

  it("should NOT filter source files, configs, and documentation", () => {
    const normalFiles = [
      "src/index.ts",
      "src/git/diff.ts",
      "package.json",
      "tsconfig.json",
      "Cargo.toml",
      "go.mod",
      "README.md",
      "docs/architecture.md",
      "test/diff_filter.test.ts",
      "Makefile",
      "Dockerfile",
      "scripts/build.sh",
    ];

    for (const file of normalFiles) {
      assert.equal(isNoisyFile(file, [], true), false, "Expected " + file + " to NOT be filtered");
    }
  });

  it("should support custom glob ignore patterns", () => {
    const customPatterns = [
      "*.generated.ts",
      "fixtures/**",
      "docs/auto/*",
      "custom.lock",
      "data/*.csv",
    ];

    assert.equal(matchesCustomIgnore("src/schema.generated.ts", customPatterns), true);
    assert.equal(matchesCustomIgnore("fixtures/sample.json", customPatterns), true);
    assert.equal(matchesCustomIgnore("fixtures/nested/sample.json", customPatterns), true);
    assert.equal(matchesCustomIgnore("docs/auto/api.md", customPatterns), true);
    assert.equal(matchesCustomIgnore("custom.lock", customPatterns), true);
    assert.equal(matchesCustomIgnore("sub/custom.lock", customPatterns), true);
    assert.equal(matchesCustomIgnore("data/users.csv", customPatterns), true);

    assert.equal(matchesCustomIgnore("src/schema.ts", customPatterns), false);
    assert.equal(matchesCustomIgnore("docs/manual.md", customPatterns), false);
  });

  it("should respect smart_diff_filter toggle when disabled", () => {
    assert.equal(isNoisyFile("package-lock.json", [], false), false);
    assert.equal(isNoisyFile("dist/bundle.min.js", [], false), false);
    assert.equal(isNoisyFile("custom-ignore.txt", ["custom-ignore.txt"], false), true);
  });
});

describe("File Signal Prioritization Scoring", () => {
  it("should score project configuration & manifests highest (100)", () => {
    assert.equal(getFilePriority("package.json"), 100);
    assert.equal(getFilePriority("tsconfig.json"), 100);
    assert.equal(getFilePriority("tsconfig.build.json"), 100);
    assert.equal(getFilePriority("Cargo.toml"), 100);
    assert.equal(getFilePriority("go.mod"), 100);
    assert.equal(getFilePriority("pyproject.toml"), 100);
    assert.equal(getFilePriority("Dockerfile"), 100);
    assert.equal(getFilePriority("docker-compose.yml"), 100);
    assert.equal(getFilePriority(".github/workflows/ci.yml"), 100);
    assert.equal(getFilePriority("AGENTS.md"), 100);
  });

  it("should score module entrypoints and core source files with high priority (80-90)", () => {
    assert.equal(getFilePriority("src/index.ts"), 90);
    assert.equal(getFilePriority("src/main.rs"), 90);
    assert.equal(getFilePriority("src/app.js"), 90);
    assert.equal(getFilePriority("src/server.ts"), 90);
    assert.equal(getFilePriority("src/git/diff.ts"), 80);
    assert.equal(getFilePriority("lib/core/engine.go"), 80);
    assert.equal(getFilePriority("packages/auth/token.py"), 80);
  });

  it("should score documentation and specs appropriately (50-60)", () => {
    assert.equal(getFilePriority("README.md"), 60);
    assert.equal(getFilePriority("openapi.yaml"), 60);
    assert.equal(getFilePriority("docs/architecture.md"), 50);
    assert.equal(getFilePriority("docs/guide.mdx"), 50);
  });

  it("should score tests, tooling, fixtures, and localization in decreasing priority", () => {
    const testScore = getFilePriority("test/diff.test.ts");
    const scriptScore = getFilePriority("scripts/deploy.sh");
    const styleScore = getFilePriority("src/styles/theme.css");
    const fixtureScore = getFilePriority("fixtures/mock_users.json");
    const localeScore = getFilePriority("locales/en.json");

    assert.equal(testScore, 40);
    assert.equal(scriptScore, 30);
    assert.equal(styleScore, 25);
    assert.equal(fixtureScore, 20);
    assert.equal(localeScore, 10);

    assert.ok(getFilePriority("package.json") > getFilePriority("src/git/diff.ts"));
    assert.ok(getFilePriority("src/git/diff.ts") > getFilePriority("README.md"));
    assert.ok(getFilePriority("README.md") > getFilePriority("test/diff.test.ts"));
    assert.ok(getFilePriority("test/diff.test.ts") > getFilePriority("scripts/deploy.sh"));
    assert.ok(getFilePriority("scripts/deploy.sh") > getFilePriority("fixtures/mock.json"));
    assert.ok(getFilePriority("fixtures/mock.json") > getFilePriority("locales/ja.json"));
  });
});

describe("Git Diff Extraction with Filtering & Prioritization in Live Repo", () => {
  let tempRepo: string;

  before(async () => {
    tempRepo = await mkdtemp(join(tmpdir(), "ingest-diff-test-"));
    await runGit(["init", "-b", "main"], tempRepo);
    await runGit(["config", "user.name", "Diff Test"], tempRepo);
    await runGit(["config", "user.email", "diff@example.com"], tempRepo);

    await writeFile(join(tempRepo, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }, null, 2));
    await writeFile(join(tempRepo, "package-lock.json"), JSON.stringify({ name: "test", lockfileVersion: 3, packages: { a: 1, b: 2, c: 3 } }, null, 2));
    await runGit(["add", "."], tempRepo);
    await runGit(["commit", "-m", "chore: initial setup"], tempRepo);

    await mkdir(join(tempRepo, "src"), { recursive: true });
    await mkdir(join(tempRepo, "test"), { recursive: true });
    await mkdir(join(tempRepo, "locales"), { recursive: true });
    await mkdir(join(tempRepo, "fixtures"), { recursive: true });

    await writeFile(join(tempRepo, "src", "index.ts"), "export function computeSum(a: number, b: number): number {\n  return a + b;\n}\n");
    await writeFile(join(tempRepo, "test", "index.test.ts"), "import { computeSum } from \"../src/index.js\";\nconsole.log(computeSum(1, 2));\n");
    await writeFile(join(tempRepo, "locales", "en.json"), JSON.stringify({ greeting: "Hello World", title: "App Title", desc: "A great application" }, null, 2));
    await writeFile(join(tempRepo, "fixtures", "data.json"), JSON.stringify({ items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }, null, 2));
    await writeFile(join(tempRepo, "custom.ignored"), "some ignored custom content line 1\nsome ignored custom content line 2\n");

    await runGit(["add", "."], tempRepo);
    await runGit(["commit", "-m", "feat: add computation and localization"], tempRepo);
  });

  after(async () => {
    if (tempRepo) {
      await rm(tempRepo, { recursive: true, force: true });
    }
  });

  it("should filter lockfiles by default during fetchDiffPatches", async () => {
    const patches = await fetchDiffPatches(tempRepo, ["main"], {}, 500);
    assert.ok(!patches.includes("package-lock.json"));
    assert.ok(patches.includes("src/index.ts"));
    assert.ok(patches.includes("package.json"));
  });

  it("should include lockfiles when smart_diff_filter is disabled", async () => {
    const patches = await fetchDiffPatches(tempRepo, ["main"], {}, {
      maxPatchLines: 500,
      smartDiffFilter: false,
    });
    assert.ok(patches.includes("package-lock.json"));
  });

  it("should filter custom ignore patterns during fetchDiffPatches", async () => {
    const patches = await fetchDiffPatches(tempRepo, ["main"], {}, {
      maxPatchLines: 500,
      diffIgnorePatterns: ["*.ignored", "fixtures/**"],
    });
    assert.ok(!patches.includes("custom.ignored"));
    assert.ok(!patches.includes("fixtures/data.json"));
    assert.ok(patches.includes("src/index.ts"));
  });

  it("should prioritize high-signal source/config files over lower-priority files when diff is truncated", async () => {
    const patches = await fetchDiffPatches(tempRepo, ["main"], {}, {
      maxPatchLines: 20,
      smartDiffFilter: true,
    });
    assert.ok(patches.includes("package.json") || patches.includes("src/index.ts"));
    assert.ok(patches.includes("truncated"));
  });

  it("should filter noisy files and sort fileStats by priority in fetchDiffStat", async () => {
    const stat = await fetchDiffStat(tempRepo, ["main"], {}, {
      maxLines: 100,
      smartDiffFilter: true,
      diffIgnorePatterns: ["*.ignored"],
    });

    assert.ok(stat !== undefined);
    assert.ok(!stat.fileStats.some((f) => f.path.includes("package-lock.json")));
    assert.ok(!stat.fileStats.some((f) => f.path.includes("custom.ignored")));
    assert.ok(stat.fileStats.some((f) => f.path === "src/index.ts"));

    const paths = stat.fileStats.map((f) => f.path);
    const pkgIndex = paths.findIndex((p) => p === "package.json");
    const localeIndex = paths.findIndex((p) => p.includes("locales"));
    if (pkgIndex !== -1 && localeIndex !== -1) {
      assert.ok(pkgIndex < localeIndex, "package.json should appear before locales in prioritized fileStats");
    }
  });

  it("should correctly load and merge diff_ignore_patterns and smart_diff_filter in ConfigManager", async () => {
    const localRcPath = join(tempRepo, ".ingestrc");
    await writeFile(
      localRcPath,
      JSON.stringify(
        {
          repo_name: "custom-filter-repo",
          smart_diff_filter: false,
          diff_ignore_patterns: ["vendor/**", "*.tmp"],
          max_diff_lines: 400,
        },
        null,
        2,
      ),
    );

    const merged = await ConfigManager.mergeRepoWithLocalConfig({
      path: tempRepo,
      branches: ["main"],
    });

    assert.equal(merged.smart_diff_filter, false);
    assert.deepEqual(merged.diff_ignore_patterns, ["vendor/**", "*.tmp"]);
    assert.equal(merged.max_diff_lines, 400);
  });
});