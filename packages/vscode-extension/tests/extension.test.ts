import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  buildDefaultCase,
  buildDefaultSuite,
  stringifyYaml,
  writeYamlFileAtomic
} from "@tlog/shared";
import * as workspace from "../src/tlog-workspace.js";
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
const onDidSaveTextDocument = vi.fn(() => eventDisposable);
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
      onDidSaveTextDocument,
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
    onDidSaveTextDocument.mockClear();
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

  it("loads once after ready, preserving unsaved suite text and filtered cases", async () => {
    const root = await mkdtemp(join(tmpdir(), "tlog-manager-load-"));
    const suite = buildDefaultSuite({ id: "suite", title: "Disk title", tags: ["inherited"] });
    await writeYamlFileAtomic(join(root, "index.yaml"), suite);
    await writeYamlFileAtomic(
      join(root, "done.yaml"),
      buildDefaultCase({ id: "done", title: "Done", status: "done" })
    );
    await writeYamlFileAtomic(
      join(root, "todo.yaml"),
      buildDefaultCase({ id: "todo", title: "Todo", status: "todo" })
    );
    const filters = { tags: ["inherited"], testcaseStatus: ["done"] };
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
      workspaceState: {
        get: (key: string) => (key === "tlog.rootDirectory" ? root : filters),
        update: async () => {}
      }
    } as unknown as Parameters<typeof activate>[0];
    await activate(context);
    const editor = registerCustomEditorProvider.mock.calls.at(-1)?.[1] as {
      resolveCustomTextEditor(document: unknown, panel: unknown): Promise<void>;
    };
    let receive!: (message: { type: string }) => void;
    const postMessage = vi.fn(async () => true);
    const panel = {
      webview: {
        options: {},
        html: "",
        postMessage,
        onDidReceiveMessage: (listener: typeof receive) => {
          receive = listener;
        }
      },
      onDidDispose: vi.fn()
    };
    const document = {
      uri: { fsPath: join(root, "index.yaml") },
      version: 1,
      isDirty: true,
      getText: () => stringifyYaml({ ...suite, title: "Unsaved title" })
    };
    const load = vi.spyOn(workspace, "withWorkspaceModel");
    await editor.resolveCustomTextEditor(document, panel);
    expect(load).not.toHaveBeenCalled();
    for (let index = 0; index < 10; index++) receive({ type: "ready" });
    await vi.waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "snapshot",
          payload: expect.objectContaining({
            selectedSuite: expect.objectContaining({ title: "Unsaved title" }),
            suiteCases: [expect.objectContaining({ id: "done" })],
            cases: [expect.objectContaining({ id: "done" })],
            relatedOptions: expect.arrayContaining([expect.objectContaining({ id: "todo" })]),
            dirty: true
          })
        })
      )
    );
    expect(load).toHaveBeenCalledTimes(1);
    load.mockRestore();
  });

  it("does not acquire a full model before ready or after disposal", async () => {
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
      workspaceState: { get: vi.fn(), update: async () => {} }
    } as unknown as Parameters<typeof activate>[0];
    await activate(context);
    const editor = registerCustomEditorProvider.mock.calls.at(-1)?.[1] as {
      resolveCustomTextEditor(document: unknown, panel: unknown): Promise<void>;
    };
    let receive!: (message: { type: string }) => void;
    let dispose!: () => void;
    const postMessage = vi.fn(async () => true);
    const panel = {
      webview: {
        options: {},
        html: "",
        postMessage,
        onDidReceiveMessage: (listener: typeof receive) => {
          receive = listener;
        }
      },
      onDidDispose: (listener: typeof dispose) => {
        dispose = listener;
      }
    };
    const load = vi.spyOn(workspace, "withWorkspaceModel");
    await editor.resolveCustomTextEditor({ uri: { fsPath: "/tests/index.yaml" } }, panel);
    dispose();
    receive({ type: "ready" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(load).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
    load.mockRestore();
  });

  it.each(["success", "failure"] as const)(
    "retries a stale Manager %s after the document and filters change",
    async (outcome) => {
      const root = await mkdtemp(join(tmpdir(), "tlog-manager-stale-"));
      const suite = buildDefaultSuite({ id: "suite", title: "Disk title" });
      await writeYamlFileAtomic(join(root, "index.yaml"), suite);
      for (const status of ["todo", "done"] as const) {
        await writeYamlFileAtomic(
          join(root, `${status}.yaml`),
          buildDefaultCase({ id: status, title: status, status })
        );
      }
      let filters = { testcaseStatus: ["todo"] };
      const context = {
        subscriptions: [],
        extensionUri: { fsPath: "/extension" },
        workspaceState: {
          get: (key: string) => (key === "tlog.rootDirectory" ? root : filters),
          update: async () => {}
        }
      } as unknown as Parameters<typeof activate>[0];
      await activate(context);
      const editor = registerCustomEditorProvider.mock.calls.at(-1)?.[1] as {
        resolveCustomTextEditor(document: unknown, panel: unknown): Promise<void>;
      };
      let receive!: (message: { type: string }) => void;
      let dispose!: () => void;
      const postMessage = vi.fn(async () => true);
      const panel = {
        webview: {
          options: {},
          html: "",
          postMessage,
          onDidReceiveMessage: (listener: typeof receive) => {
            receive = listener;
          }
        },
        onDidDispose: (listener: typeof dispose) => {
          dispose = listener;
        }
      };
      const document = {
        uri: { fsPath: join(root, "index.yaml") },
        version: 1,
        isDirty: true,
        getText: () => stringifyYaml({ ...suite, title: `Version ${document.version}` })
      };
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = workspace.withWorkspaceModel;
      const load = vi.spyOn(workspace, "withWorkspaceModel");
      load.mockImplementationOnce(async (root, consume, signal) => {
        await gate;
        if (outcome === "failure") throw new Error("superseded failure");
        return original(root, consume, signal);
      });
      try {
        await editor.resolveCustomTextEditor(document, panel);
        receive({ type: "ready" });
        await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
        document.version = 2;
        filters = { testcaseStatus: ["done"] };
        release();
        await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
        expect(postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "snapshot",
            payload: expect.objectContaining({
              selectedSuite: expect.objectContaining({ title: "Version 2" }),
              cases: [expect.objectContaining({ id: "done" })]
            })
          })
        );
        expect(load).toHaveBeenCalledTimes(2);
      } finally {
        release();
        dispose();
        load.mockRestore();
        for (const subscription of context.subscriptions) subscription.dispose();
      }
    }
  );

  it("opens and disposes a 2000-case Manager 20 times without accumulating sessions", async () => {
    const root = await mkdtemp(join(tmpdir(), "tlog-manager-cycles-"));
    const suite = buildDefaultSuite({ id: "suite", title: "Cycles" });
    await writeYamlFileAtomic(join(root, "index.yaml"), suite);
    for (let index = 0; index < 2000; index++) {
      await writeYamlFileAtomic(
        join(root, `case-${index}.yaml`),
        buildDefaultCase({ id: `case-${index}`, title: "Case", status: "todo" })
      );
    }
    const context = {
      subscriptions: [],
      extensionUri: { fsPath: "/extension" },
      workspaceState: {
        get: (key: string) => (key === "tlog.rootDirectory" ? root : undefined),
        update: async () => {}
      }
    } as unknown as Parameters<typeof activate>[0];
    await activate(context);
    const editor = registerCustomEditorProvider.mock.calls.at(-1)?.[1] as {
      resolveCustomTextEditor(document: unknown, panel: unknown): Promise<void>;
    };
    const document = {
      uri: { fsPath: join(root, "index.yaml") },
      version: 1,
      isDirty: false,
      getText: () => stringifyYaml(suite),
      save: vi.fn(async () => true)
    };
    const subscriptions = context.subscriptions.length;
    const load = vi.spyOn(workspace, "withWorkspaceModel");
    const sync = vi.spyOn(workspace, "syncReciprocalRelated");
    try {
      for (let cycle = 0; cycle < 20; cycle++) {
        let receive!: (message: { type: string }) => void;
        let dispose!: () => void;
        const postMessage = vi.fn(async () => true);
        const panel = {
          webview: {
            options: {},
            html: "",
            postMessage,
            onDidReceiveMessage: (listener: typeof receive) => {
              receive = listener;
            }
          },
          onDidDispose: (listener: typeof dispose) => {
            dispose = listener;
          }
        };
        await editor.resolveCustomTextEditor(document, panel);
        for (let burst = 0; burst < 10; burst++) receive({ type: "ready" });
        await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1), { timeout: 10000 });
        const message = postMessage.mock.calls[0][0] as unknown as {
          type: string;
          payload: { cases: unknown[]; suiteCases: unknown[] };
        };
        expect(message.type).toBe("snapshot");
        expect(message.payload.cases).toHaveLength(2000);
        expect(message.payload.suiteCases).toHaveLength(2000);
        dispose();
        receive({ type: "ready" });
        receive({ type: "save" });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(postMessage).toHaveBeenCalledTimes(1);
        expect(document.save).not.toHaveBeenCalled();
        expect(load).toHaveBeenCalledTimes(cycle + 1);
        expect(context.subscriptions).toHaveLength(subscriptions);
        postMessage.mockClear(); // The test itself must not keep prior large payloads alive.
      }
      const saveListener = onDidSaveTextDocument.mock.calls[0]?.[0] as
        | ((document: unknown) => void)
        | undefined;
      expect(saveListener).toBeTypeOf("function");
      saveListener?.(document as unknown as import("vscode").TextDocument);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(load).toHaveBeenCalledTimes(20);
      expect(sync).not.toHaveBeenCalled();
      // Removed sessions do not run reciprocal sync or refresh after a document save.
    } finally {
      load.mockRestore();
      sync.mockRestore();
      for (const subscription of context.subscriptions) subscription.dispose();
    }
  }, 30000);

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
