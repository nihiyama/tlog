import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getWorkspaceSnapshot } from "../src/tlog-workspace.js";

function suiteYaml(id: string, tags: string[], scoped: boolean): string {
  return [
    `id: ${id}`,
    `title: ${id}`,
    `tags: [${tags.join(", ")}]`,
    "description: suite",
    `scoped: ${String(scoped)}`,
    "owners: []",
    "duration:",
    "  scheduled: { start: 2026-02-20, end: 2026-02-22 }",
    "  actual: { start: 2026-02-20, end: 2026-02-22 }",
    "related: []",
    "remarks: []",
    ""
  ].join("\n");
}

function caseYaml(): string {
  return [
    "id: inherited-case",
    "title: Inherited Case",
    "owners: []",
    "tags: [case-tag]",
    "description: case",
    "scoped: true",
    "status: done",
    "operations: []",
    "related: []",
    "remarks: []",
    "completedDay: 2026-02-21",
    "tests: []",
    "issues: []",
    ""
  ].join("\n");
}

describe("workspace snapshot inheritance", () => {
  it("searches ancestor Suite tags while preserving Case tags and inherited scope", async () => {
    const root = mkdtempSync(join(tmpdir(), "tlog-vscode-inheritance-"));
    const child = join(root, "child");
    mkdirSync(child, { recursive: true });
    writeFileSync(join(root, "index.yaml"), suiteYaml("root-suite", ["root-tag"], false), "utf8");
    writeFileSync(join(child, "index.yaml"), suiteYaml("child-suite", ["child-tag"], true), "utf8");
    writeFileSync(join(child, "inherited-case.yaml"), caseYaml(), "utf8");

    const snapshot = await getWorkspaceSnapshot(root, { tags: ["root-tag"] });

    expect(snapshot.cases).toHaveLength(1);
    expect(snapshot.cases[0]?.tags).toEqual(["case-tag"]);
    expect(snapshot.cases[0]?.suiteTags).toEqual(expect.arrayContaining(["root-tag", "child-tag"]));
    expect(snapshot.cases[0]?.suiteScoped).toBe(false);
  });

  it("matches a Case tag without leaking inherited tags into the Case field", async () => {
    const root = mkdtempSync(join(tmpdir(), "tlog-vscode-case-tags-"));
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "index.yaml"), suiteYaml("root-suite", ["suite-tag"], true), "utf8");
    writeFileSync(join(root, "case.yaml"), caseYaml(), "utf8");

    const snapshot = await getWorkspaceSnapshot(root, { tags: ["case-tag"] });
    expect(snapshot.cases).toHaveLength(1);
    expect(snapshot.cases[0]?.tags).toEqual(["case-tag"]);
    expect(snapshot.cases[0]?.suiteTags).toEqual(["suite-tag"]);
    expect(snapshot.cases[0]?.suiteScoped).toBe(true);
  });
});
