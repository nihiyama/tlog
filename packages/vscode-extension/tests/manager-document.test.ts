import { buildDefaultCase, buildDefaultSuite, parseYaml, stringifyYaml } from "@tlog/shared";
import type { Suite, TestCase } from "@tlog/shared";
import { describe, expect, it } from "vitest";
import { applyManagerEdit, getManagerDocumentRelated } from "../src/manager-document.js";

describe("manager document edits", () => {
  it("updates a suite draft without writing a file", () => {
    const source = stringifyYaml(buildDefaultSuite({ id: "suite-a", title: "Before" }));
    const updated = parseYaml<Suite>(
      applyManagerEdit(
        source,
        {
          type: "editSuite",
          path: "/tests/suite-a/index.yaml",
          id: "suite-a",
          title: "After",
          description: "Draft only",
          tags: "smoke, regression",
          owners: "qa",
          scoped: true,
          scheduledStart: "2026-08-01",
          scheduledEnd: "2026-08-31",
          actualStart: "2026-08-02",
          actualEnd: "2026-08-30",
          related: "suite-b.case-b",
          remarks: "one\ntwo"
        },
        [{ ref: "suite-b.case-b", id: "case-b" }]
      )
    );

    expect(updated.title).toBe("After");
    expect(updated.tags).toEqual(["smoke", "regression"]);
    expect(updated.related).toEqual(["case-b"]);
    expect(updated.remarks).toEqual(["one", "two"]);
    expect(updated.duration.actual.end).toBe("2026-08-30");
  });

  it("updates a case draft and normalizes nested related references", () => {
    const source = stringifyYaml(buildDefaultCase({ id: "case-a", title: "Before" }));
    const updated = parseYaml<TestCase>(
      applyManagerEdit(
        source,
        {
          type: "editCase",
          path: "/tests/case-a.yaml",
          id: "case-a",
          title: "After",
          description: "Draft only",
          tags: "smoke",
          owners: "qa",
          scoped: true,
          status: "doing",
          operations: ["Run"],
          related: "suite-b.case-b",
          remarks: "note",
          completedDay: "",
          tests: [],
          issues: [
            {
              incident: "INC-1",
              owners: [],
              causes: [],
              solutions: [],
              status: "open",
              detectedDay: null,
              completedDay: null,
              related: ["suite-b.case-b"],
              remarks: []
            }
          ]
        },
        [{ ref: "suite-b.case-b", id: "case-b" }]
      )
    );

    expect(updated.title).toBe("After");
    expect(updated.completedDay).toBeNull();
    expect(updated.related).toEqual(["case-b"]);
    expect(updated.issues[0]?.related).toEqual(["case-b"]);
  });

  it("preserves half-width spaces in draft text", () => {
    const source = stringifyYaml(buildDefaultCase({ id: "case-a", title: "Before" }));
    const updated = parseYaml<TestCase>(
      applyManagerEdit(
        source,
        {
          type: "editCase",
          path: "/tests/case-a.yaml",
          id: "case-a",
          title: "After ",
          description: "Draft ",
          tags: "",
          owners: "",
          scoped: false,
          status: null,
          operations: ["Run "],
          related: "",
          remarks: " ",
          completedDay: "",
          tests: [{ name: "Check ", expected: "Expected ", actual: "", trails: ["Trail "], status: null }],
          issues: [{
            incident: "INC-1 ",
            owners: [],
            causes: ["Cause "],
            solutions: ["Solution "],
            status: "open",
            detectedDay: null,
            completedDay: null,
            related: [],
            remarks: ["Remark "]
          }]
        },
        []
      )
    );

    expect(updated.title).toBe("After ");
    expect(updated.description).toBe("Draft ");
    expect(updated.operations).toEqual(["Run "]);
    expect(updated.remarks).toEqual([" "]);
    expect(updated.tests[0]).toMatchObject({ name: "Check ", expected: "Expected ", trails: ["Trail "] });
    expect(updated.issues[0]).toMatchObject({
      incident: "INC-1 ",
      causes: ["Cause "],
      solutions: ["Solution "],
      remarks: ["Remark "]
    });
  });

  it("reads related ids from the current document state", () => {
    const source = stringifyYaml(
      buildDefaultSuite({ id: "suite-a", title: "Suite", related: ["case-b"] })
    );

    expect(getManagerDocumentRelated(source, "/tests/index.yaml")).toEqual({
      id: "suite-a",
      related: ["case-b"]
    });
  });
});
