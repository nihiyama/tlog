import { describe, expect, it } from "vitest";
import {
  applyTemplate,
  calculateBurndown,
  err,
  evaluateFilters,
  filterEntities,
  ok,
  serializeResult,
  validateTemplate
} from "../src/index.js";

describe("filter engine", () => {
  it("matches by tags and status", () => {
    const meta = evaluateFilters(
      {
        id: "case-1",
        title: "Case",
        tags: ["smoke"],
        description: "",
        scoped: true,
        status: "done",
        operations: [],
        related: [],
        remarks: [],
        completedDay: "2026-02-22",
        tests: [
          {
            name: "check",
            expected: "ok",
            actual: "ok",
            trails: [],
            status: "pass"
          }
        ],
        issues: []
      },
      {
        tags: ["smoke"],
        testcaseStatus: ["done"]
      }
    );

    expect(meta.matched).toBe(true);
  });

  it("aggregates filter meta from actual evaluations", () => {
    const result = filterEntities(
      [
        {
          id: "case-1",
          title: "Case 1",
          tags: ["smoke"],
          description: "",
          scoped: true,
          status: "done",
          operations: [],
          related: [],
          remarks: [],
          completedDay: "2026-02-22",
          tests: [],
          issues: []
        },
        {
          id: "case-2",
          title: "Case 2",
          tags: ["regression"],
          description: "",
          scoped: true,
          status: "todo",
          operations: [],
          related: [],
          remarks: [],
          completedDay: "2026-02-22",
          tests: [],
          issues: []
        }
      ],
      {
        tags: ["smoke"],
        testcaseStatus: ["done"]
      }
    );

    expect(result.items.map((item) => item.id)).toEqual(["case-1"]);
    expect(result.meta.checkedConditions).toBe(4);
    expect(result.meta.matchedConditions).toBe(2);
    expect(result.meta.reasons).toEqual(["tags", "testcaseStatus"]);
  });
});

describe("statistics", () => {
  it("calculates burndown", () => {
    const result = calculateBurndown(
      [
        {
          id: "c1",
          title: "C1",
          tags: [],
          description: "",
          scoped: true,
          status: "done",
          operations: [],
          related: [],
          remarks: [],
          completedDay: "2026-02-21",
          tests: [],
          issues: []
        }
      ],
      "2026-02-20",
      "2026-02-22"
    );

    expect(result.summary.done).toBe(1);
    expect(result.buckets.length).toBe(3);
  });
});

describe("template and result contract", () => {
  it("applies template", () => {
    const applied = applyTemplate(
      { id: "s1", title: "Suite" },
      { id: "c1", title: "Case" },
      {
        suite: { tags: ["smoke"] },
        testCase: { operations: ["step1"] }
      }
    );

    expect(applied.suite.tags).toEqual(["smoke"]);
    expect(applied.testCase.operations).toEqual(["step1"]);
    expect(validateTemplate({ suite: {}, testCase: {} }).valid).toBe(true);
  });

  it("serializes result contract", () => {
    const success = ok({ value: 1 });
    const failure = err({ code: "validation", message: "invalid" });

    expect(serializeResult(success)).toContain('"ok": true');
    expect(serializeResult(failure)).toContain('"ok": false');
  });
});
