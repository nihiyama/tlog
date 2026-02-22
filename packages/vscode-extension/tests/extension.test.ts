import { beforeEach, describe, expect, it, vi } from "vitest";

const registerCommand = vi.fn(() => ({ dispose: vi.fn() }));
const createTreeView = vi.fn(() => ({ dispose: vi.fn() }));
const registerWebviewViewProvider = vi.fn(() => ({ dispose: vi.fn() }));
const createOutputChannel = vi.fn(() => ({ appendLine: vi.fn(), dispose: vi.fn() }));
const createDiagnosticCollection = vi.fn(() => ({ set: vi.fn(), delete: vi.fn(), dispose: vi.fn() }));
const registerCompletionItemProvider = vi.fn(() => ({ dispose: vi.fn() }));
const registerDefinitionProvider = vi.fn(() => ({ dispose: vi.fn() }));
const eventDisposable = { dispose: vi.fn() };
const createFileSystemWatcher = vi.fn(() => ({
  onDidCreate: vi.fn(() => eventDisposable),
  onDidChange: vi.fn(() => eventDisposable),
  onDidDelete: vi.fn(() => eventDisposable),
  dispose: vi.fn()
}));

class TreeItem {
  constructor(
    public label: string,
    public collapsibleState?: number
  ) {}
}

vi.mock(
  "vscode",
  () => ({
    commands: {
      registerCommand,
      executeCommand: vi.fn()
    },
    window: {
      createTreeView,
      registerWebviewViewProvider,
      createWebviewPanel: vi.fn(() => ({ webview: { html: "" } })),
      createOutputChannel,
      showOpenDialog: vi.fn(),
      showInputBox: vi.fn(),
      showQuickPick: vi.fn(),
      showErrorMessage: vi.fn(),
      showInformationMessage: vi.fn(),
      showWarningMessage: vi.fn()
    },
    workspace: {
      createFileSystemWatcher,
      onDidOpenTextDocument: vi.fn(() => eventDisposable),
      onDidChangeTextDocument: vi.fn(() => eventDisposable),
      onDidSaveTextDocument: vi.fn(() => eventDisposable),
      onDidCloseTextDocument: vi.fn(() => eventDisposable),
      getConfiguration: vi.fn(() => ({ get: vi.fn(() => "recursive") })),
      getWorkspaceFolder: vi.fn()
    },
    languages: {
      createDiagnosticCollection,
      registerCompletionItemProvider,
      registerDefinitionProvider
    },
    EventEmitter: class {
      public event = vi.fn();
      fire = vi.fn();
      dispose = vi.fn();
    },
    TreeItem,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1
    },
    Uri: {
      file: (path: string) => ({ fsPath: path }),
      joinPath: (base: { fsPath?: string } | undefined, ...parts: string[]) => ({
        fsPath: [base?.fsPath ?? "", ...parts].filter((v) => v.length > 0).join("/")
      })
    },
    Range: class {
      constructor(
        public sLine: number,
        public sCol: number,
        public eLine: number,
        public eCol: number
      ) {}
    },
    Diagnostic: class {
      constructor(
        public range: unknown,
        public message: string,
        public severity: number
      ) {}
    },
    DiagnosticSeverity: { Error: 0 },
    CompletionItem: class {
      constructor(
        public label: string,
        public kind: number
      ) {}
    },
    CompletionItemKind: { Value: 12 },
    Location: class {
      constructor(
        public uri: unknown,
        public position: unknown
      ) {}
    },
    Position: class {
      constructor(
        public line: number,
        public col: number
      ) {}
    },
    ViewColumn: { One: 1 }
  }),
  { virtual: true }
);

import { activate, deactivate } from "../src/extension.js";

describe("extension lifecycle", () => {
  beforeEach(() => {
    registerCommand.mockClear();
    createTreeView.mockClear();
    registerWebviewViewProvider.mockClear();
    createOutputChannel.mockClear();
    createFileSystemWatcher.mockClear();
  });

  it("registers main commands and tree view", async () => {
    const context = {
      subscriptions: [] as { dispose(): unknown }[],
      extensionUri: { fsPath: "/tmp/extension" },
      workspaceState: {
        get: vi.fn(),
        update: vi.fn(async () => undefined)
      }
    } as unknown as Parameters<typeof activate>[0];

    await activate(context);

    expect(createTreeView).toHaveBeenCalledWith("tlog.tree", expect.any(Object));
    expect(registerWebviewViewProvider).toHaveBeenCalledWith("tlog.controls", expect.any(Object));
    expect(registerCommand).toHaveBeenCalledWith("tlog.selectRoot", expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith("tlog.openManager", expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith("tlog.refreshTree", expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith("tlog.showSuiteStats", expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith("tlog.openRelated", expect.any(Function));
  });

  it("exports deactivate", () => {
    expect(typeof deactivate).toBe("function");
  });
});
