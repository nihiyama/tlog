import { describe, expect, it } from "vitest";
import {
  asTlogDateString,
  defaultTlogSuite,
  isTlogDateString,
  isTlogStatus,
  parseYaml,
  tlogSuiteSchema,
  validateCase,
  validateSuite
} from "../src/index.js";

describe("domain types", () => {
  it("validates testcase statuses", () => {
    expect(isTlogStatus("todo")).toBe(true);
    expect(isTlogStatus("doing")).toBe(true);
    expect(isTlogStatus("done")).toBe(true);
    expect(isTlogStatus("blocked")).toBe(false);
  });

  it("supports YYYY-MM-DD date strings", () => {
    expect(isTlogDateString("2026-02-22")).toBe(true);
    expect(isTlogDateString("2026-13-01")).toBe(false);
    expect(() => asTlogDateString("x")).toThrowError(/Invalid date format/);
  });

  it("exposes strict suite schema", () => {
    const parsed = tlogSuiteSchema.parse(defaultTlogSuite);
    expect(parsed.id).toBe("default");
    expect(parsed.title).toBe("Default Suite");
  });
});

describe("validation", () => {
  it("returns warnings for empty arrays and strings", () => {
    const result = validateSuite(defaultTlogSuite);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("returns errors for invalid testcase", () => {
    const result = validateCase({ id: "case-1" });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("yaml", () => {
  it("parses yaml content", () => {
    const parsed = parseYaml<{ id: string; title: string }>("id: x\ntitle: y\n");
    expect(parsed.id).toBe("x");
    expect(parsed.title).toBe("y");
  });
});
