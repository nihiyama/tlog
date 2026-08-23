import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const registerCommand = vi.fn(() => ({ dispose: vi.fn() }));
const executeCommand = vi.fn(async () => undefined);
const createTreeView = vi.fn(() => ({ dispose: vi.fn() }));
const registerWebviewViewProvider = vi.fn(() => ({ dispose: vi.fn() }));
const registerCustomEditorProvider = vi.fn(() => ({ dispose: vi.fn() }));
const createOutputChannel = vi.fn(() => ({ appendLine: vi.fn(), dispose: vi.fn() }));
const createDiagnosticCollection = vi.fn(() => ({
  set: vi.fn(),
  delete: vi.fn(),
  dispose: vi.fn()
}));
const registerCompletionItemProvider = vi.fn(() => ({ dispose: vi.fn() }));
const registerDefinitionProvider = vi.fn(() => ({ dispose: vi.fn() }));
const eventDisposable = { dispose: vi.fn() };
const onDidChangeTextDocument = vi.fn(() => eventDisposable);
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
    env: { language: "en" },
    l10n: {
      t: (message: string, ...args: Array<string | number | boolean>) =>
        args.reduce(
          (text, value, index) => text.replaceAll("{" + index + "}", String(value)),
          message
        )
    },
    commands: {
      registerCommand,
      executeCommand
    },
    window: {
      createTreeView,
      registerWebviewViewProvider,
      registerCustomEditorProvider,
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
      applyEdit: vi.fn(async () => true),
      onDidOpenTextDocument: vi.fn(() => eventDisposable),
      onDidChangeTextDocument,
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
    WorkspaceEdit: class {
      replace = vi.fn();
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
    ViewColumn: { Active: -1, One: 1 }
  }),
  { virtual: true }
);

import { activate, deactivate } from "../src/extension.js";

describe("extension lifecycle", () => {
  beforeEach(() => {
    registerCommand.mockClear();
    executeCommand.mockClear();
    createTreeView.mockClear();
    registerWebviewViewProvider.mockClear();
    registerCustomEditorProvider.mockClear();
    createOutputChannel.mockClear();
    createFileSystemWatcher.mockClear();
    onDidChangeTextDocument.mockClear();
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
    expect(onDidChangeTextDocument).toHaveBeenCalledTimes(1);
    expect(registerCustomEditorProvider).toHaveBeenCalledWith(
      "tlog.manager",
      expect.any(Object),
      expect.objectContaining({ supportsMultipleEditorsPerDocument: false })
    );
    expect(registerCommand).toHaveBeenCalledWith("tlog.selectRoot", expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith("tlog.openManager", expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith("tlog.expandAllSuites", expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith("tlog.collapseAllSuites", expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith("tlog.refreshTree", expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith("tlog.showSuiteStats", expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith("tlog.openRelated", expect.any(Function));
  });

  it("sets the manager tab icon and returns to saved state when saving a clean document", async () => {
    const context = {
      subscriptions: [] as { dispose(): unknown }[],
      extensionUri: { fsPath: "/tmp/extension" },
      workspaceState: {
        get: vi.fn(),
        update: vi.fn(async () => undefined)
      }
    } as unknown as Parameters<typeof activate>[0];

    await activate(context);
    const customEditor = registerCustomEditorProvider.mock.calls.at(-1)?.[1] as {
      resolveCustomTextEditor(document: unknown, panel: unknown): Promise<void>;
    };
    let receiveMessage: ((message: { type: "save" }) => void) | undefined;
    const postMessage = vi.fn(async () => true);
    const panel = {
      iconPath: undefined as { fsPath: string } | undefined,
      webview: {
        options: {},
        html: "",
        postMessage,
        onDidReceiveMessage: vi.fn((listener) => {
          receiveMessage = listener;
        })
      },
      onDidDispose: vi.fn()
    };
    const document = {
      uri: { fsPath: "/tests/case-a.yaml" },
      save: vi.fn(async () => true)
    };

    await customEditor.resolveCustomTextEditor(document, panel);
    expect(panel.iconPath?.fsPath).toBe("/tmp/extension/media/manager-tab-icon.svg");
    expect(
      readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), "../media/manager-tab-icon.svg"),
        "utf8"
      )
    ).toContain('stroke="#adadad"');
    receiveMessage?.({ type: "save" });

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith({ type: "saved" });
    });
    expect(postMessage.mock.calls.map(([message]) => message)).toEqual([
      { type: "saving" },
      { type: "saved" }
    ]);
  });

  it("opens each selected YAML with the TLog custom editor", async () => {
    const context = {
      subscriptions: [] as { dispose(): unknown }[],
      extensionUri: { fsPath: "/tmp/extension" },
      workspaceState: {
        get: vi.fn(),
        update: vi.fn(async () => undefined)
      }
    } as unknown as Parameters<typeof activate>[0];

    await activate(context);
    const registration = registerCommand.mock.calls.find(([id]) => id === "tlog.openManager");
    const handler = registration?.[1] as ((node: unknown) => Promise<void>) | undefined;
    expect(handler).toBeTypeOf("function");

    await handler?.({ type: "case", path: "/tests/case-a.yaml", id: "case-a" });

    expect(executeCommand).toHaveBeenCalledWith(
      "vscode.openWith",
      expect.objectContaining({ fsPath: "/tests/case-a.yaml" }),
      "tlog.manager",
      -1
    );
  });

  it("reads package manifest contributions for suites toolbar actions", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const manifestPath = resolve(testDir, "../package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      contributes?: {
        commands?: Array<{ command: string }>;
        customEditors?: Array<{ viewType: string; priority?: string }>;
        menus?: { "view/title"?: Array<{ command: string; when?: string }> };
      };
    };

    const customEditors = manifest.contributes?.customEditors ?? [];
    expect(customEditors).toContainEqual(
      expect.objectContaining({ viewType: "tlog.manager", priority: "option" })
    );

    const commands = manifest.contributes?.commands ?? [];
    expect(commands.some((item) => item.command === "tlog.expandAllSuites")).toBe(true);
    expect(commands.some((item) => item.command === "tlog.collapseAllSuites")).toBe(true);

    const titleMenus = manifest.contributes?.menus?.["view/title"] ?? [];
    expect(
      titleMenus.some(
        (item) => item.command === "tlog.expandAllSuites" && item.when === "view == tlog.tree"
      )
    ).toBe(true);
    expect(
      titleMenus.some(
        (item) => item.command === "tlog.collapseAllSuites" && item.when === "view == tlog.tree"
      )
    ).toBe(true);
  });

  it("exports deactivate", () => {
    expect(typeof deactivate).toBe("function");
  });
});
