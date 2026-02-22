import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCaseFileName,
  buildIdIndex,
  buildSuiteFileName,
  ensureUniqueSlug,
  normalizeTlogPath,
  resolveById,
  resolveRelated,
  slugifyTitle
} from "../src/index.js";

describe("id index", () => {
  it("builds id index and resolves related ids", async () => {
    const root = mkdtempSync(join(tmpdir(), "tlog-index-"));
    mkdirSync(join(root, "tests"), { recursive: true });

    writeFileSync(
      join(root, "tests", "index.yaml"),
      [
        "id: suite-a",
        "title: Suite A",
        "tags: []",
        "description: x",
        "scoped: true",
        "owners: []",
        "duration:",
        "  scheduled: { start: 2026-01-01, end: 2026-01-02 }",
        "  actual: { start: 2026-01-01, end: 2026-01-02 }",
        "related: [case-a]",
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
        "description: x",
        "scoped: true",
        "status: todo",
        "operations: []",
        "related: []",
        "remarks: []",
        "completedDay: 2026-01-02",
        "tests: []",
        "issues: []",
        ""
      ].join("\n"),
      "utf8"
    );

    writeFileSync(
      join(root, "tests", "suite-b.suite.yaml"),
      [
        "id: suite-b",
        "title: Suite B",
        "tags: []",
        "description: x",
        "scoped: true",
        "owners: []",
        "duration:",
        "  scheduled: { start: 2026-01-03, end: 2026-01-04 }",
        "  actual: { start: 2026-01-03, end: 2026-01-04 }",
        "related: []",
        "remarks: []",
        ""
      ].join("\n"),
      "utf8"
    );

    const index = await buildIdIndex(root);
    expect(resolveById(index, "suite-a")?.type).toBe("suite");
    expect(resolveById(index, "suite-b")?.type).toBe("suite");
    expect(resolveById(index, "case-a")?.type).toBe("case");

    const related = resolveRelated(index, { related: ["case-a", "missing"] });
    expect(related.resolved.length).toBe(1);
    expect(related.missing).toEqual(["missing"]);
  });
});

describe("naming policy", () => {
  it("creates slugs and unique names", () => {
    expect(slugifyTitle("Login E2E Test")).toBe("login-e2e-test");
    const used = new Set<string>();
    expect(ensureUniqueSlug("a", used)).toBe("a");
    expect(ensureUniqueSlug("a", used)).toBe("a-2");
  });

  it("builds file names and normalizes paths", () => {
    expect(buildSuiteFileName("suite-1", "Smoke")).toBe("suite-1-smoke.suite.yaml");
    expect(buildCaseFileName("case-1", "Login")).toBe("case-1-login.testcase.yaml");
    expect(normalizeTlogPath("a//b/c")).toBe("a/b/c");
  });
});
