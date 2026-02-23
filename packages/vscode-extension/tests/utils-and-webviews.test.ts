import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { defaultTreeFilters, matchCaseWithFilters, normalizeTreeFilters } from "../src/filters.js";
import { directoryExists, isInsideRoot, pickRootPath } from "../src/path-utils.js";
import { splitCsv, splitLines } from "../src/string-utils.js";
import { controlsHtml, managerHtml } from "../src/webviews.js";

describe("filters helpers", () => {
  it("returns default tree filters", () => {
    expect(defaultTreeFilters()).toEqual({
      scopedOnly: false,
      tags: [],
      owners: [],
      testcaseStatus: [],
      issueHas: [],
      issueStatus: []
    });
  });

  it("normalizes partial filters", () => {
    const normalized = normalizeTreeFilters({
      scopedOnly: true,
      owners: ["qa"],
      issueStatus: ["open"]
    });
    expect(normalized.scopedOnly).toBe(true);
    expect(normalized.owners).toEqual(["qa"]);
    expect(normalized.tags).toEqual([]);
    expect(normalized.issueStatus).toEqual(["open"]);
  });

  it("matches case against all filter branches", () => {
    const item = {
      scoped: true,
      status: "doing" as const,
      suiteOwners: ["qa", "dev"],
      issueCount: 1,
      issueStatuses: ["open", "doing"]
    };

    expect(
      matchCaseWithFilters(item, {
        scopedOnly: true,
        tags: [],
        owners: ["qa"],
        testcaseStatus: ["doing"],
        issueHas: ["has"],
        issueStatus: ["open"]
      })
    ).toBe(true);

    expect(
      matchCaseWithFilters(
        { ...item, scoped: false },
        { scopedOnly: true, tags: [], owners: [], testcaseStatus: [], issueHas: [], issueStatus: [] }
      )
    ).toBe(false);
    expect(
      matchCaseWithFilters(
        { ...item, suiteOwners: ["ops"] },
        { scopedOnly: false, tags: [], owners: ["qa"], testcaseStatus: [], issueHas: [], issueStatus: [] }
      )
    ).toBe(false);
    expect(
      matchCaseWithFilters(
        { ...item, status: "todo" },
        { scopedOnly: false, tags: [], owners: [], testcaseStatus: ["doing"], issueHas: [], issueStatus: [] }
      )
    ).toBe(false);
    expect(
      matchCaseWithFilters(
        { ...item, issueCount: 0 },
        { scopedOnly: false, tags: [], owners: [], testcaseStatus: [], issueHas: ["has"], issueStatus: [] }
      )
    ).toBe(false);
    expect(
      matchCaseWithFilters(
        { ...item, issueStatuses: ["resolved"] },
        { scopedOnly: false, tags: [], owners: [], testcaseStatus: [], issueHas: [], issueStatus: ["open"] }
      )
    ).toBe(false);
  });
});

describe("string utils", () => {
  it("splits csv and lines", () => {
    expect(splitCsv(undefined)).toEqual([]);
    expect(splitCsv(" qa, dev ,, ")).toEqual(["qa", "dev"]);

    expect(splitLines(undefined)).toEqual([]);
    expect(splitLines("a\n\n b \r\n")).toEqual(["a", "b"]);
  });
});

describe("path utils", () => {
  it("checks directory existence", async () => {
    const root = mkdtempSync(join(tmpdir(), "tlog-vscode-utils-"));
    mkdirSync(join(root, "a"), { recursive: true });
    expect(await directoryExists(join(root, "a"))).toBe(true);
    expect(await directoryExists(join(root, "missing"))).toBe(false);
  });

  it("detects inside root path", () => {
    expect(isInsideRoot("/tmp/root", "/tmp/root")).toBe(true);
    expect(isInsideRoot("/tmp/root", "/tmp/root/a/b.yaml")).toBe(true);
    expect(isInsideRoot("/tmp/root", "/tmp/other/a.yaml")).toBe(false);
  });

  it("picks root path from dialog", async () => {
    const showOpenDialog = vi.fn(async () => [{ fsPath: "/tmp/tests" }]);
    const vscodeApi = {
      window: { showOpenDialog },
      workspace: { workspaceFolders: [{ uri: { fsPath: "/tmp" } }] },
      Uri: { file: (path: string) => ({ fsPath: path }) }
    };
    await expect(pickRootPath(vscodeApi as never)).resolves.toBe("/tmp/tests");
    expect(showOpenDialog).toHaveBeenCalledOnce();
  });

  it("returns undefined when dialog cancelled", async () => {
    const vscodeApi = {
      window: { showOpenDialog: vi.fn(async () => undefined) },
      workspace: { workspaceFolders: [] },
      Uri: { file: (path: string) => ({ fsPath: path }) }
    };
    await expect(pickRootPath(vscodeApi as never)).resolves.toBeUndefined();
  });
});

describe("webviews html", () => {
  it("contains controls sections", () => {
    const html = controlsHtml();
    expect(html).toContain("Quick filters");
    expect(html).toContain("Advanced filters");
    expect(html).toContain("Clear all filters");
    expect(html).toContain('id="activeFilters"');
  });

  it("contains manager sections", () => {
    const html = managerHtml();
    expect(html).toContain("Suite Burndown");
    expect(html).toContain("Case Editor");
    expect(html).toContain("saveState");
  });
});
