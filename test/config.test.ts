import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripJsonComments, parseJsonc } from "../src/config/parser.js";
import { ConfigManager, expandHome, resolveConfiguredPath } from "../src/config/manager.js";

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
