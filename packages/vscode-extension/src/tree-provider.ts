import type { SearchFilters } from "@tlog/shared";
import type * as vscode from "vscode";
import type { TreeNodeModel } from "./tlog-workspace.js";
import { getWorkspaceSnapshot, loadTree } from "./tlog-workspace.js";
import { matchCaseWithFilters, normalizeTreeFilters, type TreeFilters } from "./filters.js";

export class TlogTreeDataProvider implements vscode.TreeDataProvider<TreeNodeModel> {
  private readonly emitter: vscode.EventEmitter<TreeNodeModel | undefined | void>;
  private nodes: TreeNodeModel[] = [];
  private rootDirectory?: string;
  private readonly iconPaths: Record<string, { light: vscode.Uri; dark: vscode.Uri }>;

  constructor(
    private readonly vscodeApi: typeof vscode,
    private readonly context: vscode.ExtensionContext,
    private readonly rootKey: string,
    private readonly filterKey: string
  ) {
    this.emitter = new this.vscodeApi.EventEmitter<TreeNodeModel | undefined | void>();
    this.rootDirectory = context.workspaceState.get<string>(rootKey);
    const icon = (name: string) => ({
      light: this.vscodeApi.Uri.joinPath(context.extensionUri, "media", name),
      dark: this.vscodeApi.Uri.joinPath(context.extensionUri, "media", name)
    });
    this.iconPaths = {
      caseTodo: icon("status-todo.svg"),
      caseDoing: icon("status-doing.svg"),
      caseDone: icon("status-done.svg"),
      suiteAllDone: icon("suite-all-done.svg"),
      suiteNotAllDone: icon("suite-not-all-done.svg"),
      createSuite: icon("new-folder.svg")
    };
  }

  get onDidChangeTreeData(): vscode.Event<TreeNodeModel | undefined | void> {
    return this.emitter.event;
  }

  getRootDirectory(): string | undefined {
    return this.rootDirectory;
  }

  getNodes(): TreeNodeModel[] {
    return this.nodes;
  }

  async setRootDirectory(rootDirectory: string): Promise<void> {
    this.rootDirectory = rootDirectory;
    await this.context.workspaceState.update(this.rootKey, rootDirectory);
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.rootDirectory) {
      this.nodes = [
        {
          id: "guide-select-root",
          label: "Set Root from tree title action",
          type: "guide",
          path: "",
          description: "Use Set Root button in TLog view"
        }
      ];
      this.emitter.fire();
      return;
    }

    try {
      let nodes = await loadTree(this.rootDirectory);
      const filters = normalizeTreeFilters(this.context.workspaceState.get<TreeFilters>(this.filterKey));

      if (
        filters.tags.length > 0 ||
        filters.owners.length > 0 ||
        filters.testcaseStatus.length > 0 ||
        filters.issueHas.length > 0 ||
        filters.issueStatus.length > 0
      ) {
        const searchFilters: SearchFilters = {};
        if (filters.tags.length > 0) {
          searchFilters.tags = filters.tags;
        }

        const snapshot = await getWorkspaceSnapshot(this.rootDirectory, searchFilters);
        const allowedCaseIds = new Set(snapshot.cases.filter((item) => matchCaseWithFilters(item, filters)).map((item) => item.id));

        nodes = nodes.filter((node) => node.type !== "case" || allowedCaseIds.has(node.id));
      }

      this.nodes = nodes;
    } catch (error) {
      this.nodes = [
        {
          id: "guide-load-error",
          label: "Failed to load TLog root",
          type: "guide",
          path: this.rootDirectory,
          description: String(error)
        }
      ];
    }
    this.emitter.fire();
  }

  getTreeItem(element: TreeNodeModel): vscode.TreeItem {
    const collapsible =
      element.type === "suite"
        ? this.vscodeApi.TreeItemCollapsibleState.Collapsed
        : this.vscodeApi.TreeItemCollapsibleState.None;

    const item = new this.vscodeApi.TreeItem(element.label, collapsible);
    item.description = element.description;
    item.tooltip = element.path;
    item.contextValue = element.type;
    if (element.type === "case") {
      if (element.status === "done") {
        item.iconPath = this.iconPaths.caseDone;
      } else if (element.status === "doing") {
        item.iconPath = this.iconPaths.caseDoing;
      } else {
        item.iconPath = this.iconPaths.caseTodo;
      }
    }
    if (element.type === "suite") {
      item.iconPath = element.suiteAllDone ? this.iconPaths.suiteAllDone : this.iconPaths.suiteNotAllDone;
    }
    if (element.type === "guide" && element.id === "guide-create-new") {
      item.iconPath = this.iconPaths.createSuite;
      item.command = {
        command: "tlog.createSuite",
        title: "Create Suite",
        arguments: []
      };
    }
    if (element.type !== "guide") {
      item.command = {
        command: "tlog.openManager",
        title: "Open TLog Manager",
        arguments: [element]
      };
    }
    return item;
  }

  getChildren(element?: TreeNodeModel): Thenable<TreeNodeModel[]> {
    if (!element) {
      return Promise.resolve(this.nodes.filter((n) => n.type === "guide" || (n.type === "suite" && !n.parentPath)));
    }

    if (element.type === "suite") {
      return Promise.resolve(this.nodes.filter((n) => n.parentPath === element.path));
    }

    return Promise.resolve([]);
  }

  getParent(element: TreeNodeModel): vscode.ProviderResult<TreeNodeModel> {
    if (!element.parentPath) {
      return undefined;
    }
    return this.nodes.find((node) => node.path === element.parentPath);
  }
}
