import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { defaultTreeFilters, matchCaseWithFilters, normalizeTreeFilters } from "../src/filters.js";
import { directoryExists, isInsideRoot, pickRootPath } from "../src/path-utils.js";
import { splitCsv, splitLines } from "../src/string-utils.js";
import { controlsHtml, managerHtml } from "../src/webviews.js";
import {
  webviewLocalizationScript,
  webviewMessages,
  webviewPrefixes,
  type Translate
} from "../src/localization.js";

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
      owners: ["case-owner"],
      issueOwners: ["issue-owner"],
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
      matchCaseWithFilters(item, {
        scopedOnly: false,
        tags: [],
        owners: ["case-owner"],
        testcaseStatus: [],
        issueHas: [],
        issueStatus: []
      })
    ).toBe(true);

    expect(
      matchCaseWithFilters(item, {
        scopedOnly: false,
        tags: [],
        owners: ["issue-owner"],
        testcaseStatus: [],
        issueHas: [],
        issueStatus: []
      })
    ).toBe(true);

    expect(
      matchCaseWithFilters(
        { ...item, scoped: false },
        {
          scopedOnly: true,
          tags: [],
          owners: [],
          testcaseStatus: [],
          issueHas: [],
          issueStatus: []
        }
      )
    ).toBe(false);
    expect(
      matchCaseWithFilters(
        { ...item, suiteScoped: false },
        {
          scopedOnly: true,
          tags: [],
          owners: [],
          testcaseStatus: [],
          issueHas: [],
          issueStatus: []
        }
      )
    ).toBe(false);
    expect(
      matchCaseWithFilters(
        { ...item, suiteOwners: ["ops"] },
        {
          scopedOnly: false,
          tags: [],
          owners: ["qa"],
          testcaseStatus: [],
          issueHas: [],
          issueStatus: []
        }
      )
    ).toBe(false);
    expect(
      matchCaseWithFilters(
        { ...item, status: "todo" },
        {
          scopedOnly: false,
          tags: [],
          owners: [],
          testcaseStatus: ["doing"],
          issueHas: [],
          issueStatus: []
        }
      )
    ).toBe(false);
    expect(
      matchCaseWithFilters(
        { ...item, issueCount: 0 },
        {
          scopedOnly: false,
          tags: [],
          owners: [],
          testcaseStatus: [],
          issueHas: ["has"],
          issueStatus: []
        }
      )
    ).toBe(false);
    expect(
      matchCaseWithFilters(
        { ...item, issueStatuses: ["resolved"] },
        {
          scopedOnly: false,
          tags: [],
          owners: [],
          testcaseStatus: [],
          issueHas: [],
          issueStatus: ["open"]
        }
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
    expect(html).toContain("button.compactAction");
    expect(html).toContain('id="setRoot" class="compactAction"');
    expect(html).toContain('id="browseRoot" class="secondary compactAction"');
    expect(html).toContain('id="applySearch" class="compactAction"');
    expect(html).toContain('id="clearSearch" class="secondary compactAction"');
    expect(html).toContain('id="activeFilters"');
    expect(html).toContain("applyOnEnter");
    expect(html).toContain('tagsEl.addEventListener("keydown", applyOnEnter)');
    expect(html).toContain('ownersEl.addEventListener("keydown", applyOnEnter)');
    expect(html).toContain("bindEnterToChecks(statusSelect)");
  });

  it("contains manager sections", () => {
    const html = managerHtml();
    expect(html).toContain("Suite Burndown");
    expect(html).toContain("Scoped cases");
    expect(html).toContain("No scoped cases match the active search filters.");
    expect(html).toContain("snapshot.suiteBurndown");
    expect(html.indexOf("const doneByDay")).toBeLessThan(html.indexOf("doneByDay.set"));
    const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1]);
    expect(scripts.length).toBeGreaterThanOrEqual(2);
    for (const script of scripts) {
      expect(() => new Function(script)).not.toThrow();
    }
    expect(html).toContain("Case Editor");
    expect(html).toContain("saveState");
    expect(html).toContain("bindDocumentDraft");
    expect(html).toContain(".map((el) => el.value)");
    expect(html).not.toContain(".map((el) => el.value.trim())");
    expect(html).toContain("root.dispatchEvent(new Event('change', { bubbles: true }))");
    expect(html).not.toContain("bindAutoPersist");
    expect(html).toContain('data-role="save"');
    expect(html).toContain("type: 'editSuite'");
    expect(html).toContain("type: 'editCase'");
    expect(html).toContain("event.key.toLowerCase()");
    expect(html).toContain("event.shiftKey ? 'redo' : 'undo'");
    expect(html).toContain("chartTooltip");
    expect(html).toContain("deriveCaseDraftFields");
    expect(html).toContain("allTestsPass");
    expect(html).toContain("Drag to reorder operation");
    expect(html).toContain("dragHandle");
    expect(html).toContain("statusEl.value = 'done'");
  });

  it("skips DOM localization work when translations are unchanged", () => {
    const script = webviewLocalizationScript();

    expect(script).toContain(`document.documentElement.lang = "en"`);
    expect(script).not.toContain("MutationObserver");
    expect(script).not.toContain("localizeNode");
  });

  it("loads complete Japanese Webview translations with English fallback", () => {
    const english = JSON.parse(readFileSync(resolve("l10n/bundle.l10n.json"), "utf8")) as Record<
      string,
      string
    >;
    const japanese = JSON.parse(
      readFileSync(resolve("l10n/bundle.l10n.ja.json"), "utf8")
    ) as Record<string, string>;
    const translate: Translate = (message, ...args) =>
      args.reduce(
        (text, value, index) => text.replaceAll("{" + index + "}", String(value)),
        japanese[message] ?? message
      );

    for (const message of [...webviewMessages, ...webviewPrefixes]) {
      expect(english[message], `missing English translation: ${message}`).toBe(message);
      expect(japanese[message], `missing Japanese translation: ${message}`).toBeTruthy();
    }

    const controls = controlsHtml(translate, "ja");
    const manager = managerHtml(translate, "ja");
    expect(controls).toContain('document.documentElement.lang = "ja"');
    expect(controls).toContain("ルートディレクトリ");
    expect(controls).toContain("selfMutatedText");
    expect(controls).toContain("const addedNodes = new Set()");
    expect(controls).toContain("smoke, regression");
    expect(manager).toContain("スイートエディター");
    expect(manager).toContain("保存に失敗しました");
  });

  it("keeps manifest identifiers stable while localizing contributed labels", () => {
    const manifest = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
      l10n?: string;
      contributes: { commands: Array<{ command: string; title: string }> };
    };
    const english = JSON.parse(readFileSync(resolve("package.nls.json"), "utf8")) as Record<
      string,
      string
    >;
    const japanese = JSON.parse(readFileSync(resolve("package.nls.ja.json"), "utf8")) as Record<
      string,
      string
    >;

    expect(manifest.l10n).toBe("./l10n");
    expect(manifest.contributes.commands.map((command) => command.command)).toContain(
      "tlog.openManager"
    );
    const manifestKeys = Array.from(
      JSON.stringify(manifest).matchAll(/%([^%]+)%/g),
      (match) => match[1]
    );
    expect(manifestKeys.length).toBeGreaterThan(0);
    for (const key of manifestKeys) {
      expect(english[key], "missing English manifest translation: " + key).toBeTruthy();
      expect(japanese[key], "missing Japanese manifest translation: " + key).toBeTruthy();
    }
  });

  it("keeps every runtime localization call in both language bundles", () => {
    const english = JSON.parse(readFileSync(resolve("l10n/bundle.l10n.json"), "utf8")) as Record<
      string,
      string
    >;
    const japanese = JSON.parse(
      readFileSync(resolve("l10n/bundle.l10n.ja.json"), "utf8")
    ) as Record<string, string>;
    const sources = ["extension.ts", "path-utils.ts", "tree-provider.ts", "tlog-workspace.ts"]
      .map((file) => readFileSync(resolve("src", file), "utf8"))
      .join("\n");
    const keys = Array.from(sources.matchAll(/\bt(?:\?\.)?\("([^"]+)"/g), (match) => match[1]);

    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(english[key], "missing English runtime translation: " + key).toBeTruthy();
      expect(japanese[key], "missing Japanese runtime translation: " + key).toBeTruthy();
    }
  });
});
