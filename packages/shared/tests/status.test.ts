import { describe, expect, it } from "vitest";
import { defaultTlogSuite, isTlogStatus, tlogSuiteSchema } from "../src/index.js";

describe("isTlogStatus", () => {
  it("returns true for valid statuses", () => {
    expect(isTlogStatus("todo")).toBe(true);
    expect(isTlogStatus("doing")).toBe(true);
    expect(isTlogStatus("done")).toBe(true);
    expect(isTlogStatus("blocked")).toBe(true);
  });

  it("returns false for invalid statuses", () => {
    expect(isTlogStatus("pending")).toBe(false);
    expect(isTlogStatus("")).toBe(false);
  });
});

describe("tlogSuiteSchema", () => {
  it("accepts default suite object", () => {
    const parsed = tlogSuiteSchema.parse(defaultTlogSuite);
    expect(parsed.suite).toBe("default");
    expect(parsed.cases).toEqual([]);
  });
});
