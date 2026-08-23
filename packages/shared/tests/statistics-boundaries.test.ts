import { describe, expect, it } from "vitest";
import { calculateBurndown, type TestCase } from "../src/index.js";

function testCase(
  id: string,
  input: Pick<TestCase, "scoped" | "status" | "completedDay">
): TestCase {
  return {
    id,
    title: id,
    owners: [],
    tags: [],
    description: "",
    operations: [],
    related: [],
    remarks: [],
    tests: [],
    issues: [],
    ...input
  };
}

describe("burndown boundaries", () => {
  it("excludes out-of-scope cases and keeps KPI completion independent of completion dates", () => {
    const result = calculateBurndown(
      [
        testCase("before", { scoped: true, status: "done", completedDay: "2026-02-01" }),
        testCase("after", { scoped: true, status: "done", completedDay: "2026-03-01" }),
        testCase("unset", { scoped: true, status: "done", completedDay: null }),
        testCase("excluded", { scoped: false, status: "done", completedDay: "2026-02-21" })
      ],
      "2026-02-20",
      "2026-02-22"
    );

    expect(result.summary).toEqual({ todo: 0, doing: 0, done: 3, total: 3 });
    expect(result.kpis).toEqual({ completedCases: 3, remainingCases: 0, progressRate: 100 });
    expect(result.buckets.map((bucket) => bucket.actualCompleted)).toEqual([1, 1, 3]);
    expect(result.buckets.at(-1)?.actualRemaining).toBe(0);
  });

  it("calculates planned and actual remaining values from the same total", () => {
    const result = calculateBurndown(
      [
        testCase("done", { scoped: true, status: "done", completedDay: "2026-02-21" }),
        testCase("todo", { scoped: true, status: "todo", completedDay: null })
      ],
      "2026-02-20",
      "2026-02-22"
    );

    expect(result.buckets.map((bucket) => bucket.plannedRemaining)).toEqual([1, 0, 0]);
    expect(result.buckets.map((bucket) => bucket.actualRemaining)).toEqual([2, 1, 1]);
    expect(result.kpis).toEqual({ completedCases: 1, remainingCases: 1, progressRate: 50 });
  });

  it("reports empty scope and invalid dates without producing an invalid series", () => {
    const result = calculateBurndown([], "not-a-date", "2026-02-22");
    expect(result.anomalies).toEqual(["no_target_cases", "invalid_date_range"]);
    expect(result.buckets).toEqual([]);
    expect(result.kpis.progressRate).toBe(0);
  });
});
