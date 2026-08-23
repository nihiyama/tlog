import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
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
  syncReciprocalRelated
} from "./tlog-workspace.js";
import {
  defaultTreeFilters,
  matchCaseWithFilters,
  normalizeTreeFilters,
  type TreeFilters
} from "./filters.js";
import {
  applyManagerEdit,
  getManagerDocumentRelated,
  type ManagerEditMessage
} from "./manager-document.js";
import { directoryExists, isInsideRoot, pickRootPath } from "./path-utils.js";
import { splitCsv } from "./string-utils.js";
import { TlogTreeDataProvider } from "./tree-provider.js";
import { controlsHtml, managerHtml } from "./webviews.js";
import { identityTranslate, type Translate } from "./localization.js";

const ROOT_KEY = "tlog.rootDirectory";
const FILTER_KEY = "tlog.treeFilters";
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const MANAGER_VIEW_TYPE = "tlog.manager";

function createTranslate(vscodeApi: typeof vscode): Translate {
  return (message, ...args) =>
    vscodeApi.l10n?.t?.(message, ...args) ?? identityTranslate(message, ...args);
}

type ControlsMessage =
  | { type: "ready" }
  | { type: "browseRoot" }
  | { type: "setRoot"; path: string }
  | {
      type: "applySearch";
      scopedOnly: boolean;
      tags: string;
      owners: string;
      testcaseStatus: Array<"todo" | "doing" | "done">;
      issueHas: Array<"has" | "none">;
      issueStatus: Array<"open" | "doing" | "resolved" | "pending">;
    }
  | { type: "clearSearch" };

type ManagerMessage =
  | { type: "ready" }
  | { type: "save" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "openRaw"; path: string }
  | { type: "jumpToCase"; path: string }
  | { type: "jumpToPath"; path: string; entityType?: "suite" | "case" }
  | {
      type: "editSuite";
      path: string;
      id: string;
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
      type: "editCase";
      path: string;
      id: string;
      title: string;
      description: string;
      tags: string;
      owners: string;
      scoped: boolean;
      status: "todo" | "doing" | "done" | null;
      operations: string[];
      related: string;
      remarks: string;
      completedDay: string;
      tests: TestCase["tests"];
      issues: TestCase["issues"];
    };

interface RelatedOption {
  ref: string;
  id: string;
  label: string;
  path: string;
  entityType: "suite" | "case";
}

function buildRelatedOptions(
  snapshot: Awaited<ReturnType<typeof getWorkspaceSnapshot>>
): RelatedOption[] {
  const options: RelatedOption[] = [];
  for (const suite of snapshot.suites) {
    options.push({
      ref: suite.id,
      id: suite.id,
      label: `[suite] ${suite.id} - ${suite.title}`,
      path: suite.path,
      entityType: "suite"
    });
  }
  for (const testCase of snapshot.cases) {
    const ref = testCase.suiteId ? `${testCase.suiteId}.${testCase.id}` : testCase.id;
    options.push({
      ref,
      id: testCase.id,
      label: `[case] ${ref} - ${testCase.title}`,
      path: testCase.path,
      entityType: "case"
    });
  }
  return options;
}

function isValidEntityId(id: string): boolean {
  return ID_PATTERN.test(id);
}

let controlsView: vscode.WebviewView | undefined;

function isPathInside(parentDir: string, targetPath: string): boolean {
  const rel = relative(parentDir, targetPath);
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
}

async function postSnapshot(
  panel: vscode.WebviewPanel,
  rootDirectory: string | undefined,
  context: vscode.ExtensionContext,
  selection: { type: "suite" | "case"; path: string },
  document?: vscode.TextDocument
): Promise<void> {
  if (!rootDirectory) {
    await panel.webview.postMessage({
      type: "snapshot",
      payload: { root: "", suites: [], cases: [] }
    });
    return;
  }

  const filters = normalizeTreeFilters(context.workspaceState.get<TreeFilters>(FILTER_KEY));
  const searchFilters: SearchFilters = {};
  if (filters.tags.length > 0) {
    searchFilters.tags = filters.tags;
  }

  const snapshot = await getWorkspaceSnapshot(rootDirectory, searchFilters);
  const allSnapshot = await getWorkspaceSnapshot(rootDirectory);
  const filteredCases = snapshot.cases.filter((item) => matchCaseWithFilters(item, filters));
  const selectedSuiteCard =
    selection?.type === "suite"
      ? (allSnapshot.suites.find((suite) => suite.path === selection.path) ?? null)
      : null;
  const selectedCaseCard =
    selection?.type === "case"
      ? (allSnapshot.cases.find((item) => item.path === selection.path) ?? null)
      : null;
  const relatedOptions = buildRelatedOptions(allSnapshot);
  const relatedRefById = relatedOptions.reduce<Record<string, string>>((acc, item) => {
    if (!acc[item.id]) {
      acc[item.id] = item.ref;
    }
    return acc;
  }, {});
  const selectedSuite =
    selectedSuiteCard !== null
      ? ({
          ...parseYaml<Suite>(
            document?.uri.fsPath === selectedSuiteCard.path
              ? document.getText()
              : await readFile(selectedSuiteCard.path, "utf8")
          ),
          path: selectedSuiteCard.path
        } as Suite & { path: string })
      : null;
  const selectedCase =
    selectedCaseCard !== null
      ? ({
          ...parseYaml<TestCase>(
            document?.uri.fsPath === selectedCaseCard.path
              ? document.getText()
              : await readFile(selectedCaseCard.path, "utf8")
          ),
          path: selectedCaseCard.path,
          suiteId: selectedCaseCard.suiteId,
          suiteOwners: selectedCaseCard.suiteOwners,
          suiteTags: selectedCaseCard.suiteTags
        } as TestCase & {
          path: string;
          suiteId?: string;
          suiteOwners: string[];
          suiteTags: string[];
        })
      : null;
  const filteredCasePaths = new Set(filteredCases.map((item) => item.path));
  const suiteCases =
    selection?.type === "suite" && selectedSuiteCard
      ? await Promise.all(
          allSnapshot.cases
            .filter(
              (item) =>
                isPathInside(dirname(selectedSuiteCard.path), item.path) &&
                filteredCasePaths.has(item.path) &&
                item.scoped !== false &&
                item.suiteScoped !== false
            )
            .map(async (item) => ({
              ...parseYaml<TestCase>(await readFile(item.path, "utf8")),
              path: item.path,
              suiteId: item.suiteId
            }))
        )
      : [];

  const suiteBurndown =
    selectedSuite !== null
      ? calculateBurndown(
          suiteCases,
          selectedSuite.duration.scheduled.start,
          selectedSuite.duration.scheduled.end
        )
      : null;

  await panel.webview.postMessage({
    type: "snapshot",
    payload: {
      root: rootDirectory,
      suites: snapshot.suites,
      cases: filteredCases,
      selectedSuite,
      selectedCase,
      suiteCases,
      suiteBurndown,
      relatedOptions,
      relatedRefById,
      dirty: document?.isDirty ?? false
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
        new vscodeApi.Diagnostic(
          new vscodeApi.Range(0, 0, 0, 1),
          String(error),
          vscodeApi.DiagnosticSeverity.Error
        )
      ]);
    }
  }

  context.subscriptions.push(
    vscodeApi.workspace.onDidOpenTextDocument((doc) => void validateDocument(doc))
  );
  context.subscriptions.push(
    vscodeApi.workspace.onDidSaveTextDocument((doc) => void validateDocument(doc))
  );
  context.subscriptions.push(
    vscodeApi.workspace.onDidChangeTextDocument((event) => void validateDocument(event.document))
  );
}

async function openManager(
  vscodeApi: typeof vscode,
  context: vscode.ExtensionContext,
  provider: TlogTreeDataProvider,
  selectedNode?: TreeNodeModel,
  onSelectionChanged?: (path: string) => Promise<void>
): Promise<void> {
  const t = createTranslate(vscodeApi);
  let root = provider.getRootDirectory();
  if (!root) {
    root = await pickRootPath(vscodeApi);
    if (root) {
      await provider.setRootDirectory(root);
    }
  }

  if (!selectedNode || (selectedNode.type !== "suite" && selectedNode.type !== "case")) {
    vscodeApi.window.showErrorMessage(t("Select a suite or case first."));
    return;
  }

  if (onSelectionChanged) {
    await onSelectionChanged(selectedNode.path);
  }
  await vscodeApi.commands.executeCommand(
    "vscode.openWith",
    vscodeApi.Uri.file(selectedNode.path),
    MANAGER_VIEW_TYPE,
    vscodeApi.ViewColumn.Active
  );
}

interface ManagerEditorSession {
  document: vscode.TextDocument;
  panel: vscode.WebviewPanel;
  selection: { type: "suite" | "case"; path: string };
  pendingOperations: Promise<void>;
  relatedOptions: RelatedOption[];
  rootDirectory: string | undefined;
}

function managerDocumentType(path: string): "suite" | "case" {
  return path.endsWith("index.yaml") || path.endsWith(".suite.yaml") ? "suite" : "case";
}

function registerManagerCustomEditor(
  vscodeApi: typeof vscode,
  context: vscode.ExtensionContext,
  provider: TlogTreeDataProvider
): void {
  const t = createTranslate(vscodeApi);
  const language = vscodeApi.env?.language ?? "en";
  const sessions = new Set<ManagerEditorSession>();

  const postSessionSnapshot = async (session: ManagerEditorSession): Promise<void> => {
    await postSnapshot(
      session.panel,
      session.rootDirectory,
      context,
      session.selection,
      session.document
    );
  };

  const openManagerPath = async (path: string): Promise<void> => {
    await vscodeApi.commands.executeCommand(
      "vscode.openWith",
      vscodeApi.Uri.file(path),
      MANAGER_VIEW_TYPE,
      vscodeApi.ViewColumn.Active
    );
  };

  context.subscriptions.push(
    vscodeApi.window.registerCustomEditorProvider(
      MANAGER_VIEW_TYPE,
      {
        async resolveCustomTextEditor(document, panel) {
          const rootDirectory = provider.getRootDirectory();
          const relatedOptions = rootDirectory
            ? buildRelatedOptions(await getWorkspaceSnapshot(rootDirectory))
            : [];
          const session: ManagerEditorSession = {
            document,
            panel,
            selection: {
              type: managerDocumentType(document.uri.fsPath),
              path: document.uri.fsPath
            },
            pendingOperations: Promise.resolve(),
            relatedOptions,
            rootDirectory
          };
          sessions.add(session);
          panel.iconPath = vscodeApi.Uri.joinPath(
            context.extensionUri,
            "media",
            "manager-tab-icon.svg"
          );
          panel.webview.options = { enableScripts: true };
          panel.webview.html = managerHtml(t, language);
          panel.onDidDispose(() => {
            sessions.delete(session);
          });

          panel.webview.onDidReceiveMessage((message: ManagerMessage) => {
            session.pendingOperations = session.pendingOperations
              .then(async () => {
                if (message.type === "ready") {
                  await postSessionSnapshot(session);
                  return;
                }
                if (message.type === "save") {
                  await panel.webview.postMessage({ type: "saving" });
                  const saved = await document.save();
                  if (!saved) {
                    throw new Error(t("VS Code could not save the TLog document."));
                  }
                  await panel.webview.postMessage({ type: "saved" });
                  return;
                }
                if (message.type === "undo" || message.type === "redo") {
                  await vscodeApi.commands.executeCommand(message.type);
                  await postSessionSnapshot(session);
                  return;
                }
                if (message.type === "openRaw") {
                  await vscodeApi.commands.executeCommand(
                    "vscode.open",
                    vscodeApi.Uri.file(message.path)
                  );
                  return;
                }
                if (message.type === "jumpToCase" || message.type === "jumpToPath") {
                  await openManagerPath(message.path);
                  return;
                }
                if (message.type === "editSuite" || message.type === "editCase") {
                  const nextText = applyManagerEdit(
                    document.getText(),
                    message as ManagerEditMessage,
                    session.relatedOptions
                  );
                  if (nextText === document.getText()) {
                    return;
                  }

                  const edit = new vscodeApi.WorkspaceEdit();
                  edit.replace(
                    document.uri,
                    new vscodeApi.Range(
                      document.positionAt(0),
                      document.positionAt(document.getText().length)
                    ),
                    nextText
                  );
                  const applied = await vscodeApi.workspace.applyEdit(edit);
                  if (!applied) {
                    throw new Error(t("VS Code could not apply the TLog edit."));
                  }
                  await panel.webview.postMessage({ type: "dirty" });
                }
              })
              .catch(async (error) => {
                await panel.webview.postMessage({ type: "error", message: String(error) });
              });
          });
        }
      },
      {
        supportsMultipleEditorsPerDocument: false,
        webviewOptions: { retainContextWhenHidden: true }
      }
    )
  );

  context.subscriptions.push(
    vscodeApi.workspace.onDidSaveTextDocument((document) => {
      const documentSessions = [...sessions].filter((session) => session.document === document);
      if (documentSessions.length === 0) {
        return;
      }

      void (async () => {
        try {
          const rootDirectory = documentSessions[0]?.rootDirectory;
          const source = getManagerDocumentRelated(document.getText(), document.uri.fsPath);
          if (rootDirectory) {
            await syncReciprocalRelated(rootDirectory, source.id, source.related);
          }
          await provider.refresh();
          await Promise.all(
            documentSessions.map((session) => session.panel.webview.postMessage({ type: "saved" }))
          );
        } catch (error) {
          await Promise.all(
            documentSessions.map((session) =>
              session.panel.webview.postMessage({ type: "error", message: String(error) })
            )
          );
        }
      })();
    })
  );
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const vscodeApi = await import("vscode");
  const t = createTranslate(vscodeApi);
  const language = vscodeApi.env?.language ?? "en";
  await context.workspaceState.update(FILTER_KEY, defaultTreeFilters());
  const provider = new TlogTreeDataProvider(vscodeApi, context, ROOT_KEY, FILTER_KEY, t);
  registerManagerCustomEditor(vscodeApi, context, provider);
  const tree = vscodeApi.window.createTreeView("tlog.tree", { treeDataProvider: provider });
  context.subscriptions.push(tree);

  const refreshAllViews = async (): Promise<void> => {
    await provider.refresh();
  };

  const revealNodeByPath = async (path: string): Promise<boolean> => {
    const target = provider.getNodes().find((node) => node.path === path);
    if (!target) {
      return false;
    }
    await tree.reveal(target, {
      select: true,
      focus: true,
      expand: target.type === "suite" ? 1 : 0
    });
    return true;
  };

  const revealOrClearFilters = async (path: string): Promise<void> => {
    const revealed = await revealNodeByPath(path);
    if (revealed) {
      return;
    }

    const currentFilters = normalizeTreeFilters(
      context.workspaceState.get<TreeFilters>(FILTER_KEY)
    );
    if (currentFilters.tags.length === 0 && currentFilters.owners.length === 0) {
      return;
    }

    const cleared: TreeFilters = defaultTreeFilters();
    await context.workspaceState.update(FILTER_KEY, cleared);
    await refreshAllViews();
    await postControlsState(
      provider.getRootDirectory(),
      cleared,
      t("Search cleared to show created item")
    );
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
        webviewView.webview.html = controlsHtml(t, language);

        webviewView.onDidDispose(() => {
          controlsView = undefined;
        });

        webviewView.webview.onDidReceiveMessage((message: ControlsMessage) => {
          void (async () => {
            const filters = normalizeTreeFilters(
              context.workspaceState.get<TreeFilters>(FILTER_KEY)
            );

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
              await postControlsState(provider.getRootDirectory(), filters, t("Root: {0}", root));
              return;
            }

            if (message.type === "setRoot") {
              if (!message.path || !(await directoryExists(message.path))) {
                await postControlsState(
                  provider.getRootDirectory(),
                  filters,
                  t("Invalid root: {0}", message.path)
                );
                return;
              }
              await provider.setRootDirectory(message.path);
              await postControlsState(
                provider.getRootDirectory(),
                filters,
                t("Root: {0}", message.path)
              );
              return;
            }

            if (message.type === "applySearch") {
              const next: TreeFilters = {
                scopedOnly: message.scopedOnly,
                tags: splitCsv(message.tags),
                owners: splitCsv(message.owners),
                testcaseStatus: message.testcaseStatus,
                issueHas: message.issueHas,
                issueStatus: message.issueStatus
              };
              await context.workspaceState.update(FILTER_KEY, next);
              await provider.refresh();
              await postControlsState(provider.getRootDirectory(), next, t("Search applied"));
              return;
            }

            if (message.type === "clearSearch") {
              const next: TreeFilters = defaultTreeFilters();
              await context.workspaceState.update(FILTER_KEY, next);
              await provider.refresh();
              await postControlsState(provider.getRootDirectory(), next, t("Search cleared"));
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
      await postControlsState(provider.getRootDirectory(), filters, t("Root: {0}", root));
    })
  );

  context.subscriptions.push(
    vscodeApi.commands.registerCommand("tlog.searchTags", async () => {
      const current = normalizeTreeFilters(context.workspaceState.get<TreeFilters>(FILTER_KEY));
      const input = await vscodeApi.window.showInputBox({
        prompt: t("Search tags (comma separated)"),
        value: current.tags.join(",")
      });
      if (input === undefined) {
        return;
      }
      current.tags = splitCsv(input);
      await context.workspaceState.update(FILTER_KEY, current);
      await provider.refresh();
      await postControlsState(provider.getRootDirectory(), current, t("Search applied"));
    })
  );

  context.subscriptions.push(
    vscodeApi.commands.registerCommand("tlog.searchOwners", async () => {
      const current = normalizeTreeFilters(context.workspaceState.get<TreeFilters>(FILTER_KEY));
      const input = await vscodeApi.window.showInputBox({
        prompt: t("Search owners (comma separated)"),
        value: current.owners.join(",")
      });
      if (input === undefined) {
        return;
      }
      current.owners = splitCsv(input);
      await context.workspaceState.update(FILTER_KEY, current);
      await provider.refresh();
      await postControlsState(provider.getRootDirectory(), current, t("Search applied"));
    })
  );

  context.subscriptions.push(
    vscodeApi.commands.registerCommand("tlog.clearSearch", async () => {
      await context.workspaceState.update(FILTER_KEY, defaultTreeFilters());
      await provider.refresh();
      await postControlsState(
        provider.getRootDirectory(),
        defaultTreeFilters(),
        t("Search cleared")
      );
    })
  );

  context.subscriptions.push(
    vscodeApi.commands.registerCommand("tlog.createSuite", async (node?: TreeNodeModel) => {
      const root = provider.getRootDirectory();
      if (!root) {
        vscodeApi.window.showErrorMessage(t("Set root first."));
        return;
      }

      const id = await vscodeApi.window.showInputBox({ prompt: t("Suite ID") });
      const title = await vscodeApi.window.showInputBox({ prompt: t("Suite title") });
      if (!id || !title) {
        return;
      }
      if (!isValidEntityId(id)) {
        vscodeApi.window.showErrorMessage(
          t("ID must contain only alphanumeric characters, '-' or '_'.")
        );
        return;
      }

      const index = await buildWorkspaceIdIndex(root);
      if (index.byId.has(id)) {
        vscodeApi.window.showErrorMessage(t("Duplicate ID: {0}", id));
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
        vscodeApi.window.showErrorMessage(t("Set root first."));
        return;
      }

      const id = await vscodeApi.window.showInputBox({ prompt: t("Case ID") });
      const title = await vscodeApi.window.showInputBox({ prompt: t("Case title") });
      if (!id || !title) {
        return;
      }
      if (!isValidEntityId(id)) {
        vscodeApi.window.showErrorMessage(
          t("ID must contain only alphanumeric characters, '-' or '_'.")
        );
        return;
      }

      const index = await buildWorkspaceIdIndex(root);
      if (index.byId.has(id)) {
        vscodeApi.window.showErrorMessage(t("Duplicate ID: {0}", id));
        return;
      }

      let targetDirectory = node?.type === "suite" ? dirname(node.path) : "";
      if (!targetDirectory) {
        const suites = provider
          .getNodes()
          .filter((n) => n.type === "suite")
          .map((n) => ({ label: n.label, description: n.path, value: dirname(n.path) }));
        const selected = await vscodeApi.window.showQuickPick(suites, {
          placeHolder: t("Select suite directory for new case")
        });
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
      await openManager(vscodeApi, context, provider, node, async (path: string) => {
        await revealOrClearFilters(path);
      });
    })
  );

  context.subscriptions.push(
    vscodeApi.commands.registerCommand("tlog.expandAllSuites", async () => {
      await provider.refresh();
      const suites = provider.getNodes().filter((node) => node.type === "suite");
      for (const suite of suites) {
        await tree.reveal(suite, { select: false, focus: false, expand: true });
      }
    })
  );

  context.subscriptions.push(
    vscodeApi.commands.registerCommand("tlog.collapseAllSuites", async () => {
      await vscodeApi.commands.executeCommand("workbench.actions.treeView.tlog.tree.collapseAll");
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
        vscodeApi.window.showErrorMessage(t("Select suite node."));
        return;
      }

      const root = provider.getRootDirectory();
      if (!root) {
        vscodeApi.window.showErrorMessage(t("Set root first."));
        return;
      }

      const suite = parseYaml<Suite>(await readFile(node.path, "utf8"));
      const start = suite.duration?.scheduled?.start;
      const end = suite.duration?.scheduled?.end;
      if (!start || !end) {
        vscodeApi.window.showWarningMessage(t("scheduled.start/end is missing"));
        return;
      }

      const filters = normalizeTreeFilters(context.workspaceState.get<TreeFilters>(FILTER_KEY));
      const searchFilters: SearchFilters = {};
      if (filters.tags.length > 0) {
        searchFilters.tags = filters.tags;
      }
      const snapshot = await getWorkspaceSnapshot(root, searchFilters);
      const filteredCases = snapshot.cases.filter((item) => matchCaseWithFilters(item, filters));
      const filteredCasePaths = new Set(filteredCases.map((item) => item.path));
      const cases = await Promise.all(
        snapshot.cases
          .filter(
            (item) =>
              isPathInside(dirname(node.path), item.path) &&
              filteredCasePaths.has(item.path) &&
              item.scoped !== false &&
              item.suiteScoped !== false
          )
          .map(async (item) => parseYaml<TestCase>(await readFile(item.path, "utf8")))
      );

      const stats = calculateBurndown(cases, start, end);
      vscodeApi.window.showInformationMessage(
        t(
          "todo={0} doing={1} done={2}",
          stats.summary.todo,
          stats.summary.doing,
          stats.summary.done
        )
      );
    })
  );

  context.subscriptions.push(
    vscodeApi.commands.registerCommand("tlog.openRelated", async (node: TreeNodeModel) => {
      const root = provider.getRootDirectory();
      if (!root || !node || node.type === "guide") {
        vscodeApi.window.showErrorMessage(t("Select suite/case node first."));
        return;
      }

      const source = parseYaml<{ related?: string[] }>(await readFile(node.path, "utf8"));
      const related = source.related ?? [];
      const index = await buildWorkspaceIdIndex(root);
      const candidates = resolveRelatedIds(index, related);
      if (candidates.length === 0) {
        vscodeApi.window.showErrorMessage(t("No related target found."));
        return;
      }

      const picked = await vscodeApi.window.showQuickPick(candidates, {
        placeHolder: t("Open related ID")
      });
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

  context.subscriptions.push(
    vscodeApi.commands.registerCommand("tlog.openRawYaml", async (node?: TreeNodeModel) => {
      if (!node || node.type === "guide") {
        vscodeApi.window.showErrorMessage(t("Select suite/case node first."));
        return;
      }
      await vscodeApi.commands.executeCommand("vscode.open", vscodeApi.Uri.file(node.path));
    })
  );

  context.subscriptions.push(
    vscodeApi.commands.registerCommand("tlog.deleteNode", async (node?: TreeNodeModel) => {
      if (!node || node.type === "guide") {
        vscodeApi.window.showErrorMessage(t("Select suite/case node first."));
        return;
      }

      const label = node.type === "suite" ? t("suite {0}", node.id) : t("case {0}", node.id);
      const deleteAction = t("Delete");
      const answer = await vscodeApi.window.showWarningMessage(
        t("Delete {0}?", label),
        { modal: true },
        deleteAction
      );
      if (answer !== deleteAction) {
        return;
      }

      const targetPath = node.type === "suite" ? dirname(node.path) : node.path;
      const targetUri = vscodeApi.Uri.file(targetPath);
      try {
        await vscodeApi.workspace.fs.delete(targetUri, {
          recursive: node.type === "suite",
          useTrash: true
        });
      } catch (error) {
        const message = String(error);
        if (!message.toLowerCase().includes("trash")) {
          throw error;
        }
        await vscodeApi.workspace.fs.delete(targetUri, {
          recursive: node.type === "suite",
          useTrash: false
        });
      }
      await refreshAllViews();
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
