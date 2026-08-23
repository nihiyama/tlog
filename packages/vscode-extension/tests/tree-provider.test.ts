import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TlogTreeDataProvider } from "../src/tree-provider.js";

const { loadTreeMock, getWorkspaceSnapshotMock } = vi.hoisted(() => ({
  loadTreeMock: vi.fn(),
  getWorkspaceSnapshotMock: vi.fn()
}));

vi.mock("../src/tlog-workspace.js", () => ({
  loadTree: loadTreeMock,
  getWorkspaceSnapshot: getWorkspaceSnapshotMock
}));

class EventEmitter {
  public event = vi.fn();
  public fire = vi.fn();
}

class TreeItem {
  public id?: string;
  public description?: string;
  public tooltip?: string;
  public contextValue?: string;
  public iconPath?: unknown;
  public command?: { command: string; title: string; arguments?: unknown[] };
  constructor(
    public label: string,
    public collapsibleState?: number
  ) {}
}

function createProviderContext() {
  const workspaceState = {
    get: vi.fn(),
    update: vi.fn(async () => undefined)
  };
  const vscodeApi = {
    EventEmitter,
    TreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
    Uri: {
      joinPath: (...parts: Array<{ fsPath?: string } | string>) => ({ fsPath: parts.map((p) => (typeof p === "string" ? p : p.fsPath ?? "")).join("/") })
    }
  };
  const context = {
    extensionUri: { fsPath: "/tmp/ext" },
    workspaceState
  };
  return { vscodeApi, context, workspaceState };
}

function iconFileNames(item: TreeItem): { light: string; dark: string } {
  const iconPath = item.iconPath as { light: { fsPath: string }; dark: { fsPath: string } };
  return { light: iconPath.light.fsPath, dark: iconPath.dark.fsPath };
}

describe("TlogTreeDataProvider", () => {
  beforeEach(() => {
    loadTreeMock.mockReset();
    getWorkspaceSnapshotMock.mockReset();
  });

  it("shows guide when root is not set", async () => {
    const { vscodeApi, context } = createProviderContext();
    const provider = new TlogTreeDataProvider(vscodeApi as never, context as never, "root", "filters");
    await provider.refresh();
    const nodes = provider.getNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.id).toBe("guide-select-root");
  });

  it("loads nodes and filters case nodes by snapshot", async () => {
    const { vscodeApi, context, workspaceState } = createProviderContext();
    workspaceState.get.mockImplementation((key: string) => {
      if (key === "root") return "/tmp/tests";
      if (key === "filters") {
        return { tags: [], owners: ["qa"], testcaseStatus: [], issueHas: [], issueStatus: [], scopedOnly: false };
      }
      return undefined;
    });

    loadTreeMock.mockResolvedValue([
      { id: "suite-a", label: "suite-a: A", type: "suite", path: "/tmp/tests/index.yaml" },
      { id: "case-a", label: "case-a: A", type: "case", path: "/tmp/tests/case-a.yaml", parentPath: "/tmp/tests/index.yaml", status: "todo" },
      { id: "case-b", label: "case-b: B", type: "case", path: "/tmp/tests/case-b.yaml", parentPath: "/tmp/tests/index.yaml", status: "done" }
    ]);
    getWorkspaceSnapshotMock.mockResolvedValue({
      cases: [
        {
          id: "case-b",
          path: "/tmp/tests/case-b.yaml",
          scoped: true,
          status: "done",
          suiteOwners: ["qa"],
          issueCount: 0,
          issueStatuses: []
        }
      ]
    });

    const provider = new TlogTreeDataProvider(vscodeApi as never, context as never, "root", "filters");
    await provider.refresh();
    const nodes = provider.getNodes();
    expect(nodes.some((n) => n.type === "case" && n.id === "case-a")).toBe(false);
    expect(nodes.some((n) => n.type === "case" && n.id === "case-b")).toBe(true);
  });

  it("hides suite branches without matching descendants when filters are active", async () => {
    const { vscodeApi, context, workspaceState } = createProviderContext();
    workspaceState.get.mockImplementation((key: string) => {
      if (key === "root") return "/tmp/tests";
      if (key === "filters") {
        return { tags: ["smoke"], owners: [], testcaseStatus: [], issueHas: [], issueStatus: [], scopedOnly: false };
      }
      return undefined;
    });

    loadTreeMock.mockResolvedValue([
      { id: "suite-a", label: "suite-a: A", type: "suite", path: "/tmp/tests/a/index.yaml" },
      { id: "suite-a-1", label: "suite-a-1: A1", type: "suite", path: "/tmp/tests/a/a1/index.yaml", parentPath: "/tmp/tests/a/index.yaml" },
      { id: "suite-b", label: "suite-b: B", type: "suite", path: "/tmp/tests/b/index.yaml" },
      { id: "case-a-1", label: "case-a-1", type: "case", path: "/tmp/tests/a/a1/case-a-1.yaml", parentPath: "/tmp/tests/a/a1/index.yaml", status: "todo" },
      { id: "case-b-1", label: "case-b-1", type: "case", path: "/tmp/tests/b/case-b-1.yaml", parentPath: "/tmp/tests/b/index.yaml", status: "todo" }
    ]);
    getWorkspaceSnapshotMock.mockResolvedValue({
      cases: [
        {
          id: "case-a-1",
          path: "/tmp/tests/a/a1/case-a-1.yaml",
          scoped: true,
          status: "todo",
          suiteOwners: [],
          issueCount: 0,
          issueStatuses: [],
          tags: ["smoke"]
        }
      ]
    });

    const provider = new TlogTreeDataProvider(vscodeApi as never, context as never, "root", "filters");
    await provider.refresh();

    const nodes = provider.getNodes();
    expect(nodes.some((n) => n.type === "suite" && n.path === "/tmp/tests/a/index.yaml")).toBe(true);
    expect(nodes.some((n) => n.type === "suite" && n.path === "/tmp/tests/a/a1/index.yaml")).toBe(true);
    expect(nodes.some((n) => n.type === "suite" && n.path === "/tmp/tests/b/index.yaml")).toBe(false);
  });

  it("applies filtering when only scopedOnly is enabled", async () => {
    const { vscodeApi, context, workspaceState } = createProviderContext();
    workspaceState.get.mockImplementation((key: string) => {
      if (key === "root") return "/tmp/tests";
      if (key === "filters") {
        return { tags: [], owners: [], testcaseStatus: [], issueHas: [], issueStatus: [], scopedOnly: true };
      }
      return undefined;
    });

    loadTreeMock.mockResolvedValue([
      { id: "suite-a", label: "suite-a: A", type: "suite", path: "/tmp/tests/index.yaml" },
      { id: "case-a", label: "case-a: A", type: "case", path: "/tmp/tests/case-a.yaml", parentPath: "/tmp/tests/index.yaml", status: "todo" },
      { id: "case-b", label: "case-b: B", type: "case", path: "/tmp/tests/case-b.yaml", parentPath: "/tmp/tests/index.yaml", status: "done" }
    ]);
    getWorkspaceSnapshotMock.mockResolvedValue({
      cases: [
        {
          id: "case-a",
          path: "/tmp/tests/case-a.yaml",
          scoped: true,
          status: "todo",
          suiteOwners: [],
          issueCount: 0,
          issueStatuses: []
        },
        {
          id: "case-b",
          path: "/tmp/tests/case-b.yaml",
          scoped: false,
          status: "done",
          suiteOwners: [],
          issueCount: 0,
          issueStatuses: []
        }
      ]
    });

    const provider = new TlogTreeDataProvider(vscodeApi as never, context as never, "root", "filters");
    await provider.refresh();

    const nodes = provider.getNodes();
    expect(getWorkspaceSnapshotMock).toHaveBeenCalledTimes(1);
    expect(nodes.some((n) => n.type === "case" && n.path === "/tmp/tests/case-a.yaml")).toBe(true);
    expect(nodes.some((n) => n.type === "case" && n.path === "/tmp/tests/case-b.yaml")).toBe(false);
  });

  it("filters duplicate case IDs by path", async () => {
    const { vscodeApi, context, workspaceState } = createProviderContext();
    workspaceState.get.mockImplementation((key: string) => {
      if (key === "root") return "/tmp/tests";
      if (key === "filters") {
        return { tags: ["smoke"], owners: [], testcaseStatus: [], issueHas: [], issueStatus: [], scopedOnly: false };
      }
      return undefined;
    });

    loadTreeMock.mockResolvedValue([
      { id: "suite-a", label: "suite-a: A", type: "suite", path: "/tmp/tests/a/index.yaml" },
      { id: "suite-b", label: "suite-b: B", type: "suite", path: "/tmp/tests/b/index.yaml" },
      { id: "case-dup", label: "case-dup: A", type: "case", path: "/tmp/tests/a/case-dup.yaml", parentPath: "/tmp/tests/a/index.yaml", status: "todo" },
      { id: "case-dup", label: "case-dup: B", type: "case", path: "/tmp/tests/b/case-dup.yaml", parentPath: "/tmp/tests/b/index.yaml", status: "todo" }
    ]);
    getWorkspaceSnapshotMock.mockResolvedValue({
      cases: [
        {
          id: "case-dup",
          path: "/tmp/tests/a/case-dup.yaml",
          scoped: true,
          status: "todo",
          suiteOwners: [],
          issueCount: 0,
          issueStatuses: [],
          tags: ["smoke"]
        }
      ]
    });

    const provider = new TlogTreeDataProvider(vscodeApi as never, context as never, "root", "filters");
    await provider.refresh();

    const nodes = provider.getNodes();
    expect(nodes.some((n) => n.type === "case" && n.path === "/tmp/tests/a/case-dup.yaml")).toBe(true);
    expect(nodes.some((n) => n.type === "case" && n.path === "/tmp/tests/b/case-dup.yaml")).toBe(false);
  });

  it("creates expected tree items and commands", () => {
    const { vscodeApi, context } = createProviderContext();
    const provider = new TlogTreeDataProvider(vscodeApi as never, context as never, "root", "filters");

    const suiteItem = provider.getTreeItem({
      id: "suite-a",
      label: "suite-a: A",
      type: "suite",
      path: "/tmp/tests/index.yaml",
      suiteStatus: "default"
    });
    expect(suiteItem.command?.command).toBe("tlog.openManager");
    expect(suiteItem.collapsibleState).toBe(1);
    expect(suiteItem.id).toBe("suite:/tmp/tests/index.yaml");

    const caseItem = provider.getTreeItem({
      id: "case-a",
      label: "case-a: A",
      type: "case",
      path: "/tmp/tests/case-a.yaml",
      parentPath: "/tmp/tests/index.yaml",
      status: "doing"
    });
    expect(caseItem.command?.command).toBe("tlog.openManager");
    expect(caseItem.collapsibleState).toBe(0);
    expect(caseItem.id).toBe("case:/tmp/tests/case-a.yaml");

    const createNewItem = provider.getTreeItem({
      id: "guide-create-new",
      label: "Create New",
      type: "guide",
      path: "/tmp/tests"
    });
    expect(createNewItem.command?.command).toBe("tlog.createSuite");
    expect(createNewItem.id).toBe("guide:guide-create-new");
  });

  it("assigns case and suite icons for every display status", () => {
    const { vscodeApi, context } = createProviderContext();
    const provider = new TlogTreeDataProvider(vscodeApi as never, context as never, "root", "filters");

    for (const [status, expectedLight, expectedDark] of [
      ["todo", "status-todo.svg", "status-todo.svg"],
      [null, "status-todo.svg", "status-todo.svg"],
      ["doing", "status-doing-light.svg", "status-doing.svg"],
      ["done", "status-done-light.svg", "status-done.svg"]
    ] as const) {
      const item = provider.getTreeItem({
        id: "case-" + (status ?? "null"),
        label: "Case",
        type: "case",
        path: "/tmp/tests/case.yaml",
        status
      });
      const icons = iconFileNames(item as TreeItem);
      expect(icons.light).toContain(expectedLight);
      expect(icons.dark).toContain(expectedDark);
    }

    for (const [suiteStatus, expectedLight, expectedDark] of [
      ["default", "suite-not-all-done.svg", "suite-not-all-done.svg"],
      ["doing", "suite-doing-light.svg", "suite-doing.svg"],
      ["done", "suite-all-done-light.svg", "suite-all-done.svg"]
    ] as const) {
      const item = provider.getTreeItem({
        id: "suite-" + suiteStatus,
        label: "Suite",
        type: "suite",
        path: "/tmp/tests/index.yaml",
        suiteStatus
      });
      const icons = iconFileNames(item as TreeItem);
      expect(icons.light).toContain(expectedLight);
      expect(icons.dark).toContain(expectedDark);
    }
  });

  it("keeps default colors and provides light and dark doing/done colors", () => {
    const icon = (name: string) => readFileSync(new URL("../media/" + name, import.meta.url), "utf8");

    expect(icon("status-todo.svg")).toContain("#adadad");
    expect(icon("suite-not-all-done.svg")).toContain("#adadad");
    expect(icon("status-doing-light.svg")).toContain("#a65d00");
    expect(icon("status-doing.svg")).toContain("#cca700");
    expect(icon("suite-doing-light.svg")).toContain("#a65d00");
    expect(icon("suite-doing.svg")).toContain("#cca700");
    expect(icon("status-done-light.svg")).toContain("#167a45");
    expect(icon("status-done.svg")).toContain("#73c991");
    expect(icon("suite-all-done-light.svg")).toContain("#167a45");
    expect(icon("suite-all-done.svg")).toContain("#73c991");
  });

  it("returns children and parent relations", async () => {
    const { vscodeApi, context, workspaceState } = createProviderContext();
    workspaceState.get.mockImplementation((key: string) => {
      if (key === "root") return "/tmp/tests";
      if (key === "filters") return { tags: [], owners: [], testcaseStatus: [], issueHas: [], issueStatus: [], scopedOnly: false };
      return undefined;
    });
    loadTreeMock.mockResolvedValue([
      { id: "suite-a", label: "suite-a: A", type: "suite", path: "/tmp/tests/index.yaml" },
      { id: "case-a", label: "case-a: A", type: "case", path: "/tmp/tests/case-a.yaml", parentPath: "/tmp/tests/index.yaml", status: "todo" },
      { id: "guide-create-new", label: "Create New", type: "guide", path: "/tmp/tests" }
    ]);

    const provider = new TlogTreeDataProvider(vscodeApi as never, context as never, "root", "filters");
    await provider.refresh();
    const rootChildren = await provider.getChildren();
    expect(rootChildren.map((n) => n.id)).toEqual(["suite-a", "guide-create-new"]);

    const suite = rootChildren.find((n) => n.id === "suite-a");
    expect(suite).toBeTruthy();
    const children = await provider.getChildren(suite);
    expect(children).toHaveLength(1);
    expect(children[0]?.id).toBe("case-a");

    expect(provider.getParent(children[0]!)).toEqual(suite);
  });

  it("sets load error guide when loadTree fails", async () => {
    const { vscodeApi, context, workspaceState } = createProviderContext();
    workspaceState.get.mockImplementation((key: string) => (key === "root" ? "/tmp/tests" : undefined));
    loadTreeMock.mockRejectedValue(new Error("boom"));
    const provider = new TlogTreeDataProvider(vscodeApi as never, context as never, "root", "filters");
    await provider.refresh();
    expect(provider.getNodes()[0]?.id).toBe("guide-load-error");
  });
});
