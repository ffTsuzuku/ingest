import { describe, it } from "node:test";
import assert from "node:assert";
import { parseCliArgs } from "../src/cli/parser.js";

describe("CLI Argument Parser", () => {
  it("should parse --help and -h flags", () => {
    assert.deepStrictEqual(parseCliArgs(["--help"]).help, true);
    assert.deepStrictEqual(parseCliArgs(["-h"]).help, true);
  });

  it("should parse --rollup flag", () => {
    assert.deepStrictEqual(parseCliArgs(["--rollup"]).rollup, true);
    assert.deepStrictEqual(parseCliArgs(["rollup"]).rollup, true);
  });

  it("should parse --interactive and -i flags", () => {
    assert.deepStrictEqual(parseCliArgs(["--interactive"]).interactive, true);
    assert.deepStrictEqual(parseCliArgs(["-i"]).interactive, true);
  });

  it("should parse --init and init flags", () => {
    assert.deepStrictEqual(parseCliArgs(["--init"]).init, true);
    assert.deepStrictEqual(parseCliArgs(["init"]).init, true);
  });

  it("should parse --quick, --quick-init, and -q flags", () => {
    assert.deepStrictEqual(parseCliArgs(["--quick"]).quickInit, true);
    assert.deepStrictEqual(parseCliArgs(["--quick-init"]).quickInit, true);
    assert.deepStrictEqual(parseCliArgs(["-q"]).quickInit, true);
  });

  it("should parse clean/cleanup/prune aliases", () => {
    for (const alias of ["clean", "cleanup", "prune", "--clean", "--cleanup", "--clean-expired", "--clean-reports", "--prune"]) {
      assert.deepStrictEqual(parseCliArgs([alias]).cleanExpired, true, `Failed for alias: ${alias}`);
    }
  });

  it("should parse --retention-days, --days, and -d with values", () => {
    assert.deepStrictEqual(parseCliArgs(["--retention-days", "14"]).retentionDays, 14);
    assert.deepStrictEqual(parseCliArgs(["--days", "7"]).retentionDays, 7);
    assert.deepStrictEqual(parseCliArgs(["-d", "30"]).retentionDays, 30);
  });

  it("should parse --config with path", () => {
    assert.deepStrictEqual(parseCliArgs(["--config", "/path/to/config"]).configPath, "/path/to/config");
  });

  it("should parse --repo with path", () => {
    assert.deepStrictEqual(parseCliArgs(["--repo", "/path/to/repo"]).repoPath, "/path/to/repo");
  });

  it("should parse --compare and -c with range", () => {
    assert.deepStrictEqual(parseCliArgs(["--compare", "main..feature"]).compare, "main..feature");
    assert.deepStrictEqual(parseCliArgs(["-c", "v1..v2"]).compare, "v1..v2");
  });

  it("should parse --today, -t, and today flags", () => {
    assert.deepStrictEqual(parseCliArgs(["--today"]).today, true);
    assert.deepStrictEqual(parseCliArgs(["-t"]).today, true);
    assert.deepStrictEqual(parseCliArgs(["today"]).today, true);
  });

  it("should parse --date with value", () => {
    assert.deepStrictEqual(parseCliArgs(["--date", "2026-01-15"]).dateStr, "2026-01-15");
  });

  it("should parse --since and --until", () => {
    const parsed = parseCliArgs(["--since", "2026-01-01", "--until", "2026-01-31"]);
    assert.deepStrictEqual(parsed.sinceStr, "2026-01-01");
    assert.deepStrictEqual(parsed.untilStr, "2026-01-31");
  });

  it("should parse --diff flag", () => {
    assert.deepStrictEqual(parseCliArgs(["--diff"]).diffMode, true);
  });

  it("should parse --style and --report-style", () => {
    assert.deepStrictEqual(parseCliArgs(["--style", "changelog"]).reportStyle, "changelog");
    assert.deepStrictEqual(parseCliArgs(["--report-style", "security"]).reportStyle, "security");
  });

  it("should parse --format, --output-format, and -f", () => {
    assert.deepStrictEqual(parseCliArgs(["--format", "json"]).format, "json");
    assert.deepStrictEqual(parseCliArgs(["--output-format", "html"]).format, "html");
    assert.deepStrictEqual(parseCliArgs(["-f", "slack"]).format, "slack");
  });

  it("should parse --ui and serve aliases", () => {
    for (const alias of ["--ui", "ui", "--serve", "serve"]) {
      assert.deepStrictEqual(parseCliArgs([alias]).ui, true, `Failed for alias: ${alias}`);
    }
  });

  it("should parse --port with number", () => {
    assert.deepStrictEqual(parseCliArgs(["--port", "8080"]).port, 8080);
  });

  it("should parse --view with file path", () => {
    assert.deepStrictEqual(parseCliArgs(["--view", "report.md"]).viewFile, "report.md");
  });

  it("should parse --install-skill flag", () => {
    assert.deepStrictEqual(parseCliArgs(["--install-skill"]).installSkill, true);
  });

  it("should parse schedule flags", () => {
    assert.deepStrictEqual(parseCliArgs(["--schedule-install"]).scheduleInstall, true);
    assert.deepStrictEqual(parseCliArgs(["--schedule-status"]).scheduleStatus, true);
    assert.deepStrictEqual(parseCliArgs(["--schedule-remove"]).scheduleRemove, true);
  });

  it("should parse multiple flags together", () => {
    const parsed = parseCliArgs(["--repo", "/foo", "--diff", "--style", "changelog", "--format", "json"]);
    assert.deepStrictEqual(parsed.repoPath, "/foo");
    assert.deepStrictEqual(parsed.diffMode, true);
    assert.deepStrictEqual(parsed.reportStyle, "changelog");
    assert.deepStrictEqual(parsed.format, "json");
  });

  it("should treat positional argument as configPath", () => {
    assert.deepStrictEqual(parseCliArgs(["myconfig.jsonc"]).configPath, "myconfig.jsonc");
  });

  it("should return empty object for no arguments", () => {
    const parsed = parseCliArgs([]);
    assert.deepStrictEqual(parsed.help, undefined);
    assert.deepStrictEqual(parsed.rollup, undefined);
    assert.deepStrictEqual(parsed.configPath, undefined);
  });
});
