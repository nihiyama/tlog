import { describe, expect, it } from "vitest";
import { buildDefaultCase, buildDefaultSuite } from "../src/index.js";

describe("builders", () => {
  it("builds default suite with required values", () => {
    const suite = buildDefaultSuite({ id: "suite-1", title: "Suite 1" });
    expect(suite.id).toBe("suite-1");
    expect(suite.title).toBe("Suite 1");
    expect(suite.duration.scheduled.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("builds default testcase with injected status", () => {
    const testCase = buildDefaultCase({ id: "case-1", title: "Case 1", status: "doing" });
    expect(testCase.id).toBe("case-1");
    expect(testCase.status).toBe("doing");
    expect(testCase.tests).toEqual([]);
  });
});
