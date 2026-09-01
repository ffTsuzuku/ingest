import { describe, it } from "node:test";
import assert from "node:assert";
import { validateConfig } from "../src/config/validator.js";

describe("Config Validator", () => {
  it("should return no errors for a valid config", () => {
    const errors = validateConfig({
      repos: [{ path: "~/project", branches: ["main"] }],
      output_root: "~/reports",
      retention_days: 30,
      prompt: "Analyze the repo",
    });
    assert.deepStrictEqual(errors, []);
  });

  it("should return no errors for an empty config object", () => {
    const errors = validateConfig({});
    assert.deepStrictEqual(errors, []);
  });

  it("should reject non-object config", () => {
    assert.ok(validateConfig(null).length > 0);
    assert.ok(validateConfig("string").length > 0);
    assert.ok(validateConfig(42).length > 0);
    assert.ok(validateConfig([]).length > 0);
  });

  it("should reject repos when not an array", () => {
    const errors = validateConfig({ repos: "not-an-array" });
    assert.ok(errors.some(e => e.field === "repos"));
  });

  it("should reject repo without path", () => {
    const errors = validateConfig({ repos: [{ branches: ["main"] }] });
    assert.ok(errors.some(e => e.field.includes("path")));
  });

  it("should reject repo with non-array branches", () => {
    const errors = validateConfig({ repos: [{ path: "~/foo", branches: "main" }] });
    assert.ok(errors.some(e => e.field.includes("branches")));
  });

  it("should reject non-number retention_days", () => {
    const errors = validateConfig({ retention_days: "thirty" });
    assert.ok(errors.some(e => e.field === "retention_days"));
  });

  it("should reject non-string output_root", () => {
    const errors = validateConfig({ output_root: 123 });
    assert.ok(errors.some(e => e.field === "output_root"));
  });

  it("should reject non-string prompt", () => {
    const errors = validateConfig({ prompt: 42 });
    assert.ok(errors.some(e => e.field === "prompt"));
  });

  it("should reject non-object provider", () => {
    const errors = validateConfig({ provider: "antigravity" });
    assert.ok(errors.some(e => e.field === "provider"));
  });

  it("should reject non-array diff_ignore_patterns", () => {
    const errors = validateConfig({ diff_ignore_patterns: "*.lock" });
    assert.ok(errors.some(e => e.field === "diff_ignore_patterns"));
  });

  it("should reject repo with non-number max_diff_lines", () => {
    const errors = validateConfig({ repos: [{ path: "~/foo", max_diff_lines: "two hundred" }] });
    assert.ok(errors.some(e => e.field.includes("max_diff_lines")));
  });

  it("should reject repo with non-boolean diff_mode", () => {
    const errors = validateConfig({ repos: [{ path: "~/foo", diff_mode: "yes" }] });
    assert.ok(errors.some(e => e.field.includes("diff_mode")));
  });

  it("should collect multiple errors at once", () => {
    const errors = validateConfig({
      repos: "bad",
      output_root: 123,
      retention_days: "bad",
      prompt: 42,
    });
    assert.ok(errors.length >= 4);
  });
});
