import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type * as vscode from "vscode";
import { buildDefaultCase, buildDefaultSuite, writeYamlFileAtomic, type TestCase } from "@tlog/shared";
import { describe, expect, it } from "vitest";
import { defaultTreeFilters, type TreeFilters } from "../src/filters.js";
import { TlogTreeDataProvider } from "../src/tree-provider.js";
import type { SuiteStatus } from "../src/tlog-workspace.js";

// Exercise real YAML loading, snapshot filtering, pruning, and status aggregation.
class EventEmitter {
  public event = () => ({ dispose() {} });
  public fire() {}
}

class TreeItem {
  constructor(public label: string, public collapsibleState: number) {}
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "tlog-filtered-status-"));
  const child = join(root, "child");
  const grandchild = join(child, "grandchild");
  const hidden = join(root, "hidden");
  const empty = join(root, "empty");
  for (const directory of [root, child, grandchild, hidden, empty]) {
    await mkdir(directory, { recursive: true });
    await writeYamlFileAtomic(join(directory, "index.yaml"), buildDefaultSuite({
      id: directory === root ? "root" : basename(directory),
      title: "Suite",
      tags: directory === child ? ["inherited"] : [],
      owners: directory === grandchild ? ["suite-owner"] : [],
      scoped: directory !== hidden
    }));
  }
  const done = buildDefaultCase({
    id: "duplicate", title: "Done", status: "done", tags: ["selected", "mixed"], owners: ["case-owner"]
  });
  done.issues = [{
    incident: "Known issue", owners: ["issue-owner"], causes: [], solutions: [], status: "resolved",
    detectedDay: null, completedDay: null, related: [], remarks: []
  }];
  const todo = buildDefaultCase({ id: "todo", title: "Todo", status: "todo", scoped: false });
  const doing = buildDefaultCase({ id: "duplicate", title: "Doing", status: "doing" });
  const unset = buildDefaultCase({ id: "unset", title: "Unset", tags: ["mixed"] });
  unset.status = null;
  const cases: Array<[string, TestCase]> = [
    [join(grandchild, "done.yaml"), done], [join(root, "todo.yaml"), todo],
    [join(hidden, "doing.yaml"), doing], [join(root, "unset.yaml"), unset]
  ];
  for (const [path, testCase] of cases) await writeYamlFileAtomic(path, testCase);

  let filters = defaultTreeFilters();
  const workspaceState = {
    get: (key: string) => key === "root" ? root : filters,
    update: async () => {}
  };
  const vscodeApi = {
    EventEmitter, TreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
    Uri: {
      joinPath: (base: { fsPath: string }, ...parts: string[]) => ({ fsPath: join(base.fsPath, ...parts) })
    }
  };
  const provider = new TlogTreeDataProvider(
    vscodeApi as unknown as typeof vscode,
    { workspaceState, extensionUri: { fsPath: "/extension" } } as unknown as vscode.ExtensionContext,
    "root", "filters"
  );
  return {
    provider, root, child, grandchild, hidden, empty, done,
    donePath: cases[0]![0],
    setFilters: (next: Partial<TreeFilters>) => { filters = { ...defaultTreeFilters(), ...next }; }
  };
}

function expectSuite(provider: TlogTreeDataProvider, path: string, status: SuiteStatus) {
  const suite = provider.getNodes().find((node) => node.type === "suite" && node.path === join(path, "index.yaml"));
  expect(suite, `suite at ${path}`).toBeDefined();
  expect(suite?.suiteStatus).toBe(status);
  const icons = provider.getTreeItem(suite!).iconPath as { light: { fsPath: string }; dark: { fsPath: string } };
  const expectedIcons = {
    default: ["suite-not-all-done.svg", "suite-not-all-done.svg"],
    doing: ["suite-doing-light.svg", "suite-doing.svg"],
    done: ["suite-all-done-light.svg", "suite-all-done.svg"]
  };
  expect(icons.light.fsPath).toBe(join("/extension/media", expectedIcons[status][0]!));
  expect(icons.dark.fsPath).toBe(join("/extension/media", expectedIcons[status][1]!));
}

describe("suite statuses after filtering real YAML", () => {
  const scenarios: Array<[string, Partial<TreeFilters>, string[], SuiteStatus]> = [
    ["done status", { testcaseStatus: ["done"] }, ["Done"], "done"],
    ["todo status", { testcaseStatus: ["todo"] }, ["Todo"], "default"],
    ["doing status", { testcaseStatus: ["doing"] }, ["Doing"], "doing"],
    ["case tag", { tags: ["selected"] }, ["Done"], "done"],
    ["ancestor suite tag", { tags: ["inherited"] }, ["Done"], "done"],
    ["case owner", { owners: ["case-owner"] }, ["Done"], "done"],
    ["immediate suite owner", { owners: ["suite-owner"] }, ["Done"], "done"],
    ["issue owner", { owners: ["issue-owner"] }, ["Done"], "done"],
    ["issue presence", { issueHas: ["has"] }, ["Done"], "done"],
    ["no issues", { issueHas: ["none"], tags: ["mixed"] }, ["Unset"], "default"],
    ["issue status", { issueStatus: ["resolved"] }, ["Done"], "done"],
    ["scope only", { scopedOnly: true }, ["Done", "Unset"], "doing"],
    ["scope and status", { scopedOnly: true, testcaseStatus: ["done", "doing"] }, ["Done"], "done"],
    ["combined filters", { tags: ["inherited"], owners: ["issue-owner"], testcaseStatus: ["done"], issueHas: ["has"], issueStatus: ["resolved"], scopedOnly: true }, ["Done"], "done"],
    ["done and null", { tags: ["mixed"] }, ["Done", "Unset"], "doing"],
    ["done and todo", { testcaseStatus: ["done", "todo"] }, ["Done", "Todo"], "doing"]
  ];

  it.each(scenarios)("matches displayed cases and icons for %s", async (_name, filters, titles, status) => {
    const fixture = await createFixture();
    fixture.setFilters(filters);
    await fixture.provider.refresh();
    const nodes = fixture.provider.getNodes();
    expect(nodes.filter((node) => node.type === "case").map((node) => node.label.split(": ")[1]).sort())
      .toEqual([...titles].sort());
    expectSuite(fixture.provider, fixture.root, status);
    if (titles.includes("Done")) {
      expectSuite(fixture.provider, fixture.child, "done");
      expectSuite(fixture.provider, fixture.grandchild, "done");
    } else {
      expect(nodes.some((node) => node.path === join(fixture.child, "index.yaml"))).toBe(false);
    }
    expect(nodes.some((node) => node.path === join(fixture.hidden, "index.yaml"))).toBe(titles.includes("Doing"));
    expect(nodes.some((node) => node.path === join(fixture.empty, "index.yaml"))).toBe(false);
  });

  it("updates all ancestors when filters change or clear and when case YAML changes", async () => {
    const fixture = await createFixture();
    fixture.setFilters({ testcaseStatus: ["done"] });
    await fixture.provider.refresh();
    for (const path of [fixture.root, fixture.child, fixture.grandchild]) expectSuite(fixture.provider, path, "done");

    fixture.setFilters({ testcaseStatus: ["todo"] });
    await fixture.provider.refresh();
    expectSuite(fixture.provider, fixture.root, "default");

    fixture.setFilters({});
    await fixture.provider.refresh();
    expect(fixture.provider.getNodes().filter((node) => node.type === "case")).toHaveLength(4);
    expectSuite(fixture.provider, fixture.root, "doing");
    expectSuite(fixture.provider, fixture.empty, "default");

    fixture.setFilters({ tags: ["selected"] });
    await fixture.provider.refresh();
    fixture.done.status = "todo";
    await writeYamlFileAtomic(fixture.donePath, fixture.done);
    await fixture.provider.refresh();
    for (const path of [fixture.root, fixture.child, fixture.grandchild]) expectSuite(fixture.provider, path, "default");

    fixture.done.tags = [];
    await writeYamlFileAtomic(fixture.donePath, fixture.done);
    await fixture.provider.refresh();
    expect(fixture.provider.getNodes()).toEqual([]);
  });

  it("hides all suites when nothing matches and restores them after clearing filters", async () => {
    const fixture = await createFixture();
    fixture.setFilters({ tags: ["missing"] });
    await fixture.provider.refresh();
    expect(fixture.provider.getNodes()).toEqual([]);
    expect(await fixture.provider.getChildren()).toEqual([]);
    fixture.setFilters({});
    await fixture.provider.refresh();
    expectSuite(fixture.provider, fixture.root, "doing");
    expectSuite(fixture.provider, fixture.empty, "default");
  });

  it("excludes cases below an unscoped ancestor only when scopedOnly is active", async () => {
    const fixture = await createFixture();
    await writeYamlFileAtomic(join(fixture.child, "index.yaml"), buildDefaultSuite({
      id: "child", title: "Child", scoped: false, tags: ["inherited"]
    }));
    fixture.setFilters({ scopedOnly: true });
    await fixture.provider.refresh();
    expect(fixture.provider.getNodes().filter((node) => node.type === "case").map((node) => node.id))
      .toEqual(["unset"]);
    expectSuite(fixture.provider, fixture.root, "default");
    expect(fixture.provider.getNodes().some((node) => node.path === join(fixture.child, "index.yaml")))
      .toBe(false);

    fixture.setFilters({ tags: ["inherited"] });
    await fixture.provider.refresh();
    for (const path of [fixture.root, fixture.child, fixture.grandchild]) expectSuite(fixture.provider, path, "done");
  });
});
