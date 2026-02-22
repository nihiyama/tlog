import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { calculateBurndown, parseYaml, validateCase, validateSuite } from "@tlog/shared";
import type { SearchFilters, Suite, TestCase } from "@tlog/shared";
import type * as vscode from "vscode";
import {
  type TreeNodeModel,
  buildWorkspaceIdIndex,
  createCase,
  createSuite,
  getWorkspaceSnapshot,
  parseYamlDocument,
  resolveRelatedIds,
  updateCase,
  updateSuite
} from "./tlog-workspace.js";
import { defaultTreeFilters, matchCaseWithFilters, normalizeTreeFilters, type TreeFilters } from "./filters.js";
import { directoryExists, isInsideRoot, pickRootPath } from "./path-utils.js";
import { splitCsv, splitLines } from "./string-utils.js";
import { TlogTreeDataProvider } from "./tree-provider.js";
import { controlsHtml, managerHtml } from "./webviews.js";

const ROOT_KEY = "tlog.rootDirectory";
const FILTER_KEY = "tlog.treeFilters";

type ControlsMessage =
  | { type: "ready" }
  | { type: "browseRoot" }
  | { type: "setRoot"; path: string }
  | {
      type: "applySearch";
      tags: string;
      owners: string;
      testcaseStatus: Array<"todo" | "doing" | "done">;
      issueHas: Array<"has" | "none">;
      issueStatus: Array<"open" | "doing" | "resolved" | "pending">;
    }
  | { type: "clearSearch" };

type ManagerMessage =
  | { type: "ready" }
  | { type: "openRaw"; path: string }
  | {
      type: "saveSuite";
      path: string;
      title: string;
      description: string;
      tags: string;
      owners: string;
      scoped: boolean;
      scheduledStart: string;
      scheduledEnd: string;
      actualStart: string;
      actualEnd: string;
      related: string;
      remarks: string;
    }
  | {
      type: "saveCase";
      path: string;
      title: string;
      description: string;
      tags: string;
      scoped: boolean;
      status: "todo" | "doing" | "done" | null;
      operations: string[];
      related: string;
      remarks: string;
      completedDay: string;
      tests: TestCase["tests"];
      issues: TestCase["issues"];
    };

let managerPanel: vscode.WebviewPanel | undefined;
let controlsView: vscode.WebviewView | undefined;
let managerSelection: { type: "suite" | "case"; path: string } | undefined;

async function postSnapshot(
  panel: vscode.WebviewPanel,
  rootDirectory: string | undefined,
  context: vscode.ExtensionContext
): Promise<void> {
  if (!rootDirectory) {
    await panel.webview.postMessage({ type: "snapshot", payload: { root: "", suites: [], cases: [] } });
    return;
  }

  const filters = normalizeTreeFilters(context.workspaceState.get<TreeFilters>(FILTER_KEY));
  const searchFilters: SearchFilters = {};
  if (filters.tags.length > 0) {
    searchFilters.tags = filters.tags;
  }

  const snapshot = await getWorkspaceSnapshot(rootDirectory, searchFilters);
  const filteredCases = snapshot.cases.filter((item) => matchCaseWithFilters(item, filters));
  const selection = managerSelection;
  const selectedSuiteCard = selection?.type === "suite" ? snapshot.suites.find((suite) => suite.path === selection.path) ?? null : null;
  const selectedCaseCard = selection?.type === "case" ? filteredCases.find((item) => item.path === selection.path) ?? null : null;
  const selectedSuite =
    selectedSuiteCard !== null
      ? ({
          ...parseYaml<Suite>(await readFile(selectedSuiteCard.path, "utf8")),
          path: selectedSuiteCard.path
        } as Suite & { path: string })
      : null;
  const selectedCase =
    selectedCaseCard !== null
      ? ({
          ...parseYaml<TestCase>(await readFile(selectedCaseCard.path, "utf8")),
          path: selectedCaseCard.path,
          suiteId: selectedCaseCard.suiteId
        } as TestCase & { path: string; suiteId?: string })
      : null;
  const suiteCases =
    selection?.type === "suite" && selectedSuiteCard
      ? await Promise.all(
          filteredCases
            .filter((item) => item.suiteId === selectedSuiteCard.id)
            .map(async (item) => ({
              ...parseYaml<TestCase>(await readFile(item.path, "utf8")),
              path: item.path,
              suiteId: item.suiteId
            }))
        )
      : [];

  await panel.webview.postMessage({
    type: "snapshot",
    payload: {
      root: rootDirectory,
      suites: snapshot.suites,
      cases: filteredCases,
      selectedSuite,
      selectedCase,
      suiteCases
    }
  });
}

async function postControlsState(
  rootDirectory: string | undefined,
  filters: TreeFilters,
  status = ""
): Promise<void> {
  if (!controlsView) {
    return;
  }
  await controlsView.webview.postMessage({
    type: "state",
    root: rootDirectory ?? "",
    filters,
    status
  });
}

function registerDiagnostics(vscodeApi: typeof vscode, context: vscode.ExtensionContext): void {
  const collection = vscodeApi.languages.createDiagnosticCollection("tlog");
  context.subscriptions.push(collection);

  async function validateDocument(document: vscode.TextDocument): Promise<void> {
    if (!document.fileName.endsWith(".yaml")) {
      return;
    }

    try {
      const parsed = parseYamlDocument<unknown>(document.getText());
      const result =
        document.fileName.endsWith("index.yaml") || document.fileName.endsWith(".suite.yaml")
          ? validateSuite(parsed)
          : validateCase(parsed);

      const diagnostics = result.errors.map(
        (error) =>
          new vscodeApi.Diagnostic(
            new vscodeApi.Range(0, 0, 0, 1),
            `${error.path}: ${error.message}`,
            vscodeApi.DiagnosticSeverity.Error
          )
      );

      collection.set(document.uri, diagnostics);
    } catch (error) {
      collection.set(document.uri, [
        new vscodeApi.Diagnostic(new vscodeApi.Range(0, 0, 0, 1), String(error), vscodeApi.DiagnosticSeverity.Error)
      ]);
    }
  }

  context.subscriptions.push(vscodeApi.workspace.onDidOpenTextDocument((doc) => void validateDocument(doc)));
  context.subscriptions.push(vscodeApi.workspace.onDidSaveTextDocument((doc) => void validateDocument(doc)));
  context.subscriptions.push(vscodeApi.workspace.onDidChangeTextDocument((event) => void validateDocument(event.document)));
}

async function openManager(
  vscodeApi: typeof vscode,
  context: vscode.ExtensionContext,
  provider: TlogTreeDataProvider,
  selectedNode?: TreeNodeModel
): Promise<void> {
  let root = provider.getRootDirectory();
  if (!root) {
    root = await pickRootPath(vscodeApi);
    if (root) {
      await provider.setRootDirectory(root);
    }
  }

  if (!managerPanel) {
    managerPanel = vscodeApi.window.createWebviewPanel("tlog.manager", "TLog Manager", vscodeApi.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true
    });
    managerPanel.webview.html = managerHtml();
    managerPanel.onDidDispose(() => {
      managerPanel = undefined;
      managerSelection = undefined;
    });

    managerPanel.webview.onDidReceiveMessage((message: ManagerMessage) => {
      void (async () => {
        if (!managerPanel) {
          return;
        }

        try {
          if (message.type === "ready") {
            await postSnapshot(managerPanel, provider.getRootDirectory(), context);
            return;
          }

          if (message.type === "openRaw") {
            await vscodeApi.commands.executeCommand("vscode.open", vscodeApi.Uri.file(message.path));
            return;
          }

          if (message.type === "saveSuite") {
            await updateSuite(message.path, {
              title: message.title,
              description: message.description,
              tags: splitCsv(message.tags),
              scoped: message.scoped,
              owners: splitCsv(message.owners),
              duration: {
                scheduled: {
                  start: message.scheduledStart as Suite["duration"]["scheduled"]["start"],
                  end: message.scheduledEnd as Suite["duration"]["scheduled"]["end"]
                },
                actual: {
                  start: message.actualStart as Suite["duration"]["actual"]["start"],
                  end: message.actualEnd as Suite["duration"]["actual"]["end"]
                }
              },
              related: splitCsv(message.related),
              remarks: splitLines(message.remarks)
            });
            await provider.refresh();
            await postSnapshot(managerPanel, provider.getRootDirectory(), context);
            return;
          }

          if (message.type === "saveCase") {
            await updateCase(message.path, {
              title: message.title,
              description: message.description,
              tags: splitCsv(message.tags),
              scoped: message.scoped,
              status: message.status,
              operations: message.operations,
              related: splitCsv(message.related),
              remarks: splitLines(message.remarks),
              completedDay:
                message.completedDay.trim().length > 0 ? (message.completedDay as TestCase["completedDay"]) : null,
              tests: message.tests,
              issues: message.issues
            });
            await provider.refresh();
            await postSnapshot(managerPanel, provider.getRootDirectory(), context);
            return;
          }
        } catch (error) {
          if (managerPanel) {
            await managerPanel.webview.postMessage({ type: "error", message: String(error) });
          }
        }
      })();
    });
  } else {
    managerPanel.reveal(vscodeApi.ViewColumn.One);
  }

  if (selectedNode && (selectedNode.type === "suite" || selectedNode.type === "case")) {
    managerSelection = { type: selectedNode.type, path: selectedNode.path };
  }

  await postSnapshot(managerPanel, provider.getRootDirectory(), context);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const vscodeApi = await import("vscode");
  await context.workspaceState.update(FILTER_KEY, defaultTreeFilters());
  const provider = new TlogTreeDataProvider(vscodeApi, context, ROOT_KEY, FILTER_KEY);
  const tree = vscodeApi.window.createTreeView("tlog.tree", { treeDataProvider: provider });
  context.subscriptions.push(tree);

  const refreshAllViews = async (): Promise<void> => {
    await provider.refresh();
    if (managerPanel) {
      await postSnapshot(managerPanel, provider.getRootDirectory(), context);
    }
  };

  const revealNodeByPath = async (path: string): Promise<boolean> => {
    const target = provider.getNodes().find((node) => node.path === path);
    if (!target) {
      return false;
    }
    await tree.reveal(target, { select: true, focus: false, expand: target.type === "suite" ? 1 : 0 });
    return true;
  };

  const revealOrClearFilters = async (path: string): Promise<void> => {
    const revealed = await revealNodeByPath(path);
    if (revealed) {
      return;
    }

    const currentFilters = normalizeTreeFilters(context.workspaceState.get<TreeFilters>(FILTER_KEY));
    if (currentFilters.tags.length === 0 && currentFilters.owners.length === 0) {
      return;
    }

    const cleared: TreeFilters = defaultTreeFilters();
    await context.workspaceState.update(FILTER_KEY, cleared);
    await refreshAllViews();
    await postControlsState(provider.getRootDirectory(), cleared, "Search cleared to show created item");
    await revealNodeByPath(path);
  };

  const yamlWatcher = vscodeApi.workspace.createFileSystemWatcher("**/*.yaml");
  const onYamlChanged = (uri: vscode.Uri): void => {
    const root = provider.getRootDirectory();
    if (!root || !isInsideRoot(root, uri.fsPath)) {
      return;
    }
    void refreshAllViews();
  };
  context.subscriptions.push(yamlWatcher);
  context.subscriptions.push(yamlWatcher.onDidCreate(onYamlChanged));
  context.subscriptions.push(yamlWatcher.onDidChange(onYamlChanged));
  context.subscriptions.push(yamlWatcher.onDidDelete(onYamlChanged));

  context.subscriptions.push(
    vscodeApi.window.registerWebviewViewProvider("tlog.controls", {
      resolveWebviewView(webviewView) {
        controlsView = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = controlsHtml();

        webviewView.onDidDispose(() => {
          controlsView = undefined;
        });

        webviewView.webview.onDidReceiveMessage((message: ControlsMessage) => {
          void (async () => {
            const filters = normalizeTreeFilters(context.workspaceState.get<TreeFilters>(FILTER_KEY));

            if (message.type === "ready") {
              await postControlsState(provider.getRootDirectory(), filters);
              return;
            }

            if (message.type === "browseRoot") {
              const root = await pickRootPath(vscodeApi);
              if (!root) {
                return;
              }
              await provider.setRootDirectory(root);
              await postControlsState(provider.getRootDirectory(), filters, `Root: ${root}`);
              if (managerPanel) {
                await postSnapshot(managerPanel, provider.getRootDirectory(), context);
              }
              return;
            }

            if (message.type === "setRoot") {
              if (!message.path || !(await directoryExists(message.path))) {
                await postControlsState(provider.getRootDirectory(), filters, `Invalid root: ${message.path}`);
                return;
              }
              await provider.setRootDirectory(message.path);
              await postControlsState(provider.getRootDirectory(), filters, `Root: ${message.path}`);
              if (managerPanel) {
                await postSnapshot(managerPanel, provider.getRootDirectory(), context);
              }
              return;
            }

            if (message.type === "applySearch") {
              const next: TreeFilters = {
                tags: splitCsv(message.tags),
                owners: splitCsv(message.owners),
                testcaseStatus: message.testcaseStatus,
                issueHas: message.issueHas,
                issueStatus: message.issueStatus
              };
              await context.workspaceState.update(FILTER_KEY, next);
              await provider.refresh();
              await postControlsState(provider.getRootDirectory(), next, "Search applied");
              if (managerPanel) {
                await postSnapshot(managerPanel, provider.getRootDirectory(), context);
              }
              return;
            }

            if (message.type === "clearSearch") {
              const next: TreeFilters = defaultTreeFilters();
              await context.workspaceState.update(FILTER_KEY, next);
              await provider.refresh();
              await postControlsState(provider.getRootDirectory(), next, "Search cleared");
              if (managerPanel) {
                await postSnapshot(managerPanel, provider.getRootDirectory(), context);
              }
            }
          })();
        });
      }
    })
  );

  registerDiagnostics(vscodeApi, context);

  context.subscriptions.push(
    vscodeApi.commands.registerCommand("tlog.selectRoot", async () => {
      const root = await pickRootPath(vscodeApi);
      if (!root) {
        return;
      }
      await provider.setRootDirectory(root);
      const filters = normalizeTreeFilters(context.workspaceState.get<TreeFilters>(FILTER_KEY));
      await postControlsState(provider.getRootDirectory(), filters, `Root: ${root}`);
      if (managerPanel) {
        await postSnapshot(managerPanel, provider.getRootDirectory(), context);
      }
    })
  );

  context.subscriptions.push(
    vscodeApi.commands.registerCommand("tlog.searchTags", async () => {
      const current = normalizeTreeFilters(context.workspaceState.get<TreeFilters>(FILTER_KEY));
      const input = await vscodeApi.window.showInputBox({
        prompt: "Search tags (comma separated)",
        value: current.tags.join(",")
      });
      if (input === undefined) {
        return;
      }
      current.tags = splitCsv(input);
      await context.workspaceState.update(FILTER_KEY, current);
      await provider.refresh();
      await postControlsState(provider.getRootDirectory(), current, "Search applied");
      if (managerPanel) {
        await postSnapshot(managerPanel, provider.getRootDirectory(), context);
      }
    })
  );

  context.subscriptions.push(
    vscodeApi.commands.registerCommand("tlog.searchOwners", async () => {
      const current = normalizeTreeFilters(context.workspaceState.get<TreeFilters>(FILTER_KEY));
      const input = await vscodeApi.window.showInputBox({
        prompt: "Search owners (comma separated)",
        value: current.owners.join(",")
      });
      if (input === undefined) {
        return;
      }
      current.owners = splitCsv(input);
      await context.workspaceState.update(FILTER_KEY, current);
      await provider.refresh();
      await postControlsState(provider.getRootDirectory(), current, "Search applied");
      if (managerPanel) {
        await postSnapshot(managerPanel, provider.getRootDirectory(), context);
      }
    })
  );

  context.subscriptions.push(
    vscodeApi.commands.registerCommand("tlog.clearSearch", async () => {
      await context.workspaceState.update(FILTER_KEY, defaultTreeFilters());
      await provider.refresh();
      await postControlsState(provider.getRootDirectory(), defaultTreeFilters(), "Search cleared");
      if (managerPanel) {
        await postSnapshot(managerPanel, provider.getRootDirectory(), context);
      }
    })
  );

  context.subscriptions.push(
    vscodeApi.commands.registerCommand("tlog.createSuite", async (node?: TreeNodeModel) => {
      const root = provider.getRootDirectory();
      if (!root) {
        vscodeApi.window.showErrorMessage("Set root first.");
        return;
      }

      const id = await vscodeApi.window.showInputBox({ prompt: "Suite ID" });
      const title = await vscodeApi.window.showInputBox({ prompt: "Suite title" });
      if (!id || !title) {
        return;
      }

      const index = await buildWorkspaceIdIndex(root);
      if (index.byId.has(id)) {
        vscodeApi.window.showErrorMessage(`Duplicate ID: ${id}`);
        return;
      }

      const targetDirectory = node?.type === "suite" ? dirname(node.path) : root;
      const createdPath = await createSuite({ targetDirectory, id, title });
      await refreshAllViews();
      await revealOrClearFilters(createdPath);
    })
  );

  context.subscriptions.push(
    vscodeApi.commands.registerCommand("tlog.createCase", async (node?: TreeNodeModel) => {
      const root = provider.getRootDirectory();
      if (!root) {
        vscodeApi.window.showErrorMessage("Set root first.");
        return;
      }

      const id = await vscodeApi.window.showInputBox({ prompt: "Case ID" });
      const title = await vscodeApi.window.showInputBox({ prompt: "Case title" });
      if (!id || !title) {
        return;
      }

      const index = await buildWorkspaceIdIndex(root);
      if (index.byId.has(id)) {
        vscodeApi.window.showErrorMessage(`Duplicate ID: ${id}`);
        return;
      }

      let targetDirectory = node?.type === "suite" ? dirname(node.path) : "";
      if (!targetDirectory) {
        const suites = provider
          .getNodes()
          .filter((n) => n.type === "suite")
          .map((n) => ({ label: n.label, description: n.path, value: dirname(n.path) }));
        const selected = await vscodeApi.window.showQuickPick(suites, { placeHolder: "Select suite directory for new case" });
        if (!selected) {
          return;
        }
        targetDirectory = selected.value;
      }
      const createdPath = await createCase({ targetDirectory, id, title });
      await refreshAllViews();
      await revealOrClearFilters(createdPath);
    })
  );

  context.subscriptions.push(
    vscodeApi.commands.registerCommand("tlog.openManager", async (node?: TreeNodeModel) => {
      await openManager(vscodeApi, context, provider, node);
    })
  );

  context.subscriptions.push(
    vscodeApi.commands.registerCommand("tlog.refreshTree", async () => {
      await refreshAllViews();
    })
  );

  context.subscriptions.push(
    vscodeApi.commands.registerCommand("tlog.showSuiteStats", async (node: TreeNodeModel) => {
      if (!node || node.type !== "suite") {
        vscodeApi.window.showErrorMessage("Select suite node.");
        return;
      }

      const root = provider.getRootDirectory();
      if (!root) {
        vscodeApi.window.showErrorMessage("Set root first.");
        return;
      }

      const suite = parseYaml<{ duration?: { scheduled?: { start?: string; end?: string } } }>(
        await readFile(node.path, "utf8")
      );
      const start = suite.duration?.scheduled?.start;
      const end = suite.duration?.scheduled?.end;
      if (!start || !end) {
        vscodeApi.window.showWarningMessage("scheduled.start/end is missing");
        return;
      }

      const snapshot = await getWorkspaceSnapshot(root, {});
      const cases = snapshot.cases
        .filter((item) => item.suiteId === node.id)
        .map(
          (item) =>
            ({
              id: item.id,
              title: item.title,
              tags: item.tags,
              description: item.description,
              scoped: true,
              status: item.status,
              operations: [],
              related: [],
              remarks: [],
              completedDay: "1970-01-01",
              tests: [],
              issues: []
            } as unknown as TestCase)
        );

      const stats = calculateBurndown(cases, start, end);
      vscodeApi.window.showInformationMessage(
        `todo=${stats.summary.todo} doing=${stats.summary.doing} done=${stats.summary.done}`
      );
    })
  );

  context.subscriptions.push(
    vscodeApi.commands.registerCommand("tlog.openRelated", async (node: TreeNodeModel) => {
      const root = provider.getRootDirectory();
      if (!root || !node || node.type === "guide") {
        vscodeApi.window.showErrorMessage("Select suite/case node first.");
        return;
      }

      const source = parseYaml<{ related?: string[] }>(await readFile(node.path, "utf8"));
      const related = source.related ?? [];
      const index = await buildWorkspaceIdIndex(root);
      const candidates = resolveRelatedIds(index, related);
      if (candidates.length === 0) {
        vscodeApi.window.showErrorMessage("No related target found.");
        return;
      }

      const picked = await vscodeApi.window.showQuickPick(candidates, { placeHolder: "Open related ID" });
      if (!picked) {
        return;
      }

      const target = index.byId.get(picked);
      if (!target) {
        return;
      }

      await vscodeApi.commands.executeCommand("vscode.open", vscodeApi.Uri.file(target.path));
    })
  );

  await provider.refresh();
  await postControlsState(
    provider.getRootDirectory(),
    normalizeTreeFilters(context.workspaceState.get<TreeFilters>(FILTER_KEY))
  );
}

export function deactivate(): void {
  // no-op
}
