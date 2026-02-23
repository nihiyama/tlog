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

class EventEmitter<T> {
  public event = vi.fn();
  public fire = vi.fn();
}

class TreeItem {
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
        { id: "case-b", scoped: true, status: "done", suiteOwners: ["qa"], issueCount: 0, issueStatuses: [] }
      ]
    });

    const provider = new TlogTreeDataProvider(vscodeApi as never, context as never, "root", "filters");
    await provider.refresh();
    const nodes = provider.getNodes();
    expect(nodes.some((n) => n.type === "case" && n.id === "case-a")).toBe(false);
    expect(nodes.some((n) => n.type === "case" && n.id === "case-b")).toBe(true);
  });

  it("creates expected tree items and commands", () => {
    const { vscodeApi, context } = createProviderContext();
    const provider = new TlogTreeDataProvider(vscodeApi as never, context as never, "root", "filters");

    const suiteItem = provider.getTreeItem({
      id: "suite-a",
      label: "suite-a: A",
      type: "suite",
      path: "/tmp/tests/index.yaml",
      suiteAllDone: false
    });
    expect(suiteItem.command?.command).toBe("tlog.openManager");
    expect(suiteItem.collapsibleState).toBe(1);

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

    const createNewItem = provider.getTreeItem({
      id: "guide-create-new",
      label: "Create New",
      type: "guide",
      path: "/tmp/tests"
    });
    expect(createNewItem.command?.command).toBe("tlog.createSuite");
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
