import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCase, createSuite, findSuiteFiles, loadTree } from "../src/tlog-workspace.js";

const IS_COVERAGE_RUN = process.env.VITEST_COVERAGE === "true" || process.env.npm_lifecycle_event === "test:coverage";
const PERF_THRESHOLD_MS = IS_COVERAGE_RUN ? 4500 : 2000;

describe("tlog workspace", () => {
  it("loads suite/case tree from index.yaml", async () => {
    const root = mkdtempSync(join(tmpdir(), "tlog-vscode-"));
    mkdirSync(join(root, "tests"), { recursive: true });

    writeFileSync(
      join(root, "tests", "index.yaml"),
      [
        "id: suite-root",
        "title: Root",
        "tags: []",
        "description: root",
        "scoped: true",
        "owners: []",
        "duration:",
        "  scheduled: { start: 2026-02-01, end: 2026-02-10 }",
        "  actual: { start: 2026-02-01, end: 2026-02-10 }",
        "related: []",
        "remarks: []",
        ""
      ].join("\n"),
      "utf8"
    );

    writeFileSync(
      join(root, "tests", "case-a.yaml"),
      [
        "id: case-a",
        "title: Case A",
        "tags: []",
        "description: case",
        "scoped: true",
        "status: todo",
        "operations: []",
        "related: []",
        "remarks: []",
        "completedDay: 2026-02-02",
        "tests: []",
        "issues: []",
        ""
      ].join("\n"),
      "utf8"
    );

    const suites = await findSuiteFiles(root);
    expect(suites.length).toBe(1);

    const tree = await loadTree(root);
    expect(tree.some((node) => node.type === "suite" && node.id === "suite-root")).toBe(true);
    expect(tree.some((node) => node.type === "case" && node.id === "case-a")).toBe(true);
  });

  it("creates suite and case files with id-based naming", async () => {
    const root = mkdtempSync(join(tmpdir(), "tlog-vscode-create-"));
    const suitePath = await createSuite({ targetDirectory: root, id: "suite-1", title: "Smoke Suite" });
    const casePath = await createCase({ targetDirectory: root, id: "case-1", title: "Login Happy Path" });

    expect(suitePath.endsWith("suite-1/index.yaml")).toBe(true);
    expect(casePath.endsWith("case-1.yaml")).toBe(true);
  });

  it("loads 1000-case tree within reasonable bounds", async () => {
    const root = mkdtempSync(join(tmpdir(), "tlog-vscode-perf-"));
    mkdirSync(join(root, "tests"), { recursive: true });

    writeFileSync(
      join(root, "tests", "index.yaml"),
      [
        "id: suite-perf",
        "title: Perf",
        "tags: []",
        "description: perf",
        "scoped: true",
        "owners: []",
        "duration:",
        "  scheduled: { start: 2026-02-01, end: 2026-02-10 }",
        "  actual: { start: 2026-02-01, end: 2026-02-10 }",
        "related: []",
        "remarks: []",
        ""
      ].join("\n"),
      "utf8"
    );

    for (let i = 0; i < 1000; i += 1) {
      writeFileSync(
        join(root, "tests", `case-${i}.yaml`),
        [
          `id: case-${i}`,
          `title: Case ${i}`,
          "tags: []",
          "description: case",
          "scoped: true",
          "status: todo",
          "operations: []",
          "related: []",
          "remarks: []",
          "completedDay: 2026-02-02",
          "tests: []",
          "issues: []",
          ""
        ].join("\n"),
        "utf8"
      );
    }

    const startedAt = Date.now();
    const tree = await loadTree(root);
    const elapsed = Date.now() - startedAt;

    expect(tree.filter((node) => node.type === "case")).toHaveLength(1000);
    expect(elapsed).toBeLessThan(PERF_THRESHOLD_MS);
  });
});
