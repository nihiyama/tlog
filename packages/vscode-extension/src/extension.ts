import { readFile, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { calculateBurndown, parseYaml, validateCase, validateSuite } from "@tlog/shared";
import type { SearchFilters, Suite, TestCase } from "@tlog/shared";
import type * as vscode from "vscode";
import {
  type TreeNodeModel,
  buildWorkspaceIdIndex,
  createCase,
  createSuite,
  getWorkspaceSnapshot,
  loadTree,
  parseYamlDocument,
  resolveRelatedIds,
  updateCase,
  updateSuite
} from "./tlog-workspace.js";

const ROOT_KEY = "tlog.rootDirectory";
const FILTER_KEY = "tlog.treeFilters";

type TreeFilters = {
  tags: string[];
  owners: string[];
  testcaseStatus: Array<"todo" | "doing" | "done">;
  issueHas: Array<"has" | "none">;
  issueStatus: Array<"open" | "doing" | "resolved" | "pending">;
};

function defaultTreeFilters(): TreeFilters {
  return {
    tags: [],
    owners: [],
    testcaseStatus: [],
    issueHas: [],
    issueStatus: []
  };
}

function normalizeTreeFilters(value: Partial<TreeFilters> | undefined): TreeFilters {
  const base = defaultTreeFilters();
  if (!value) {
    return base;
  }
  return {
    tags: Array.isArray(value.tags) ? value.tags : base.tags,
    owners: Array.isArray(value.owners) ? value.owners : base.owners,
    testcaseStatus: Array.isArray(value.testcaseStatus) ? value.testcaseStatus : base.testcaseStatus,
    issueHas: Array.isArray(value.issueHas) ? value.issueHas : base.issueHas,
    issueStatus: Array.isArray(value.issueStatus) ? value.issueStatus : base.issueStatus
  };
}

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

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function splitCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function splitLines(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function matchCaseWithFilters(
  item: {
    status: TestCase["status"];
    suiteOwners: string[];
    issueCount: number;
    issueStatuses: string[];
  },
  filters: TreeFilters
): boolean {
  if (filters.owners.length > 0 && !filters.owners.some((owner) => item.suiteOwners.includes(owner))) {
    return false;
  }
  if (filters.testcaseStatus.length > 0 && !filters.testcaseStatus.includes((item.status ?? null) as "todo" | "doing" | "done")) {
    return false;
  }
  if (filters.issueHas.length > 0) {
    const hasIssues = item.issueCount > 0;
    const hasMatch = (hasIssues && filters.issueHas.includes("has")) || (!hasIssues && filters.issueHas.includes("none"));
    if (!hasMatch) {
      return false;
    }
  }
  if (filters.issueStatus.length > 0) {
    if (!filters.issueStatus.some((status) => item.issueStatuses.includes(status))) {
      return false;
    }
  }
  return true;
}

class TlogTreeDataProvider implements vscode.TreeDataProvider<TreeNodeModel> {
  private readonly emitter: vscode.EventEmitter<TreeNodeModel | undefined | void>;
  private nodes: TreeNodeModel[] = [];
  private rootDirectory?: string;
  private readonly iconPaths: Record<string, { light: vscode.Uri; dark: vscode.Uri }>;

  constructor(
    private readonly vscodeApi: typeof vscode,
    private readonly context: vscode.ExtensionContext
  ) {
    this.emitter = new this.vscodeApi.EventEmitter<TreeNodeModel | undefined | void>();
    this.rootDirectory = context.workspaceState.get<string>(ROOT_KEY);
    const icon = (name: string) => ({
      light: this.vscodeApi.Uri.joinPath(context.extensionUri, "media", name),
      dark: this.vscodeApi.Uri.joinPath(context.extensionUri, "media", name)
    });
    this.iconPaths = {
      caseTodo: icon("status-todo.svg"),
      caseDoing: icon("status-doing.svg"),
      caseDone: icon("status-done.svg"),
      suiteAllDone: icon("suite-all-done.svg"),
      suiteNotAllDone: icon("suite-not-all-done.svg")
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
    await this.context.workspaceState.update(ROOT_KEY, rootDirectory);
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
      const filters = normalizeTreeFilters(this.context.workspaceState.get<TreeFilters>(FILTER_KEY));

      if (filters.tags.length > 0 || filters.owners.length > 0) {
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
}

async function pickRootPath(vscodeApi: typeof vscode): Promise<string | undefined> {
  const selected = await vscodeApi.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: "Select tlog root directory",
    title: "Select tlog root directory"
  });

  return selected?.[0]?.fsPath;
}

function isInsideRoot(rootDirectory: string, candidatePath: string): boolean {
  const rel = relative(rootDirectory, candidatePath);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}

function controlsHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: var(--vscode-font-family); margin: 0; padding: 10px; }
      .box { border: 1px solid var(--vscode-editorWidget-border); border-radius: 6px; padding: 8px; margin-bottom: 8px; }
      .row { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
      .searchRow { display: flex; align-items: center; gap: 6px; border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 4px 6px; }
      .searchIcon { width: 14px; height: 14px; opacity: 0.8; }
      input { flex: 1; min-width: 0; padding: 4px 6px; border: 1px solid var(--vscode-input-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
      .searchRow input { border: none; padding: 0; background: transparent; }
      button { border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; padding: 3px 8px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
      button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
      .label { font-size: 11px; opacity: 0.85; }
      #status { font-size: 11px; opacity: 0.8; margin-top: 6px; }
    </style>
  </head>
  <body>
    <div class="box">
      <div class="label">Root</div>
      <div class="row">
        <input id="rootPath" placeholder="tlog root directory" />
      </div>
      <div class="row">
        <button id="setRoot">Set Root</button>
        <button id="browseRoot" class="secondary">Browse</button>
      </div>
      <div id="status"></div>
    </div>

    <div class="box">
      <div class="label">Search</div>
      <div class="searchRow">
        <svg class="searchIcon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4"></circle>
          <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
        </svg>
        <input id="tags" placeholder="tags: smoke, regression" />
      </div>
      <div class="searchRow" style="margin-top:6px;">
        <svg class="searchIcon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4"></circle>
          <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
        </svg>
        <input id="owners" placeholder="owners: qa-team" />
      </div>
      <div class="row">
        <button id="applySearch">Apply</button>
        <button id="clearSearch" class="secondary">Clear</button>
      </div>
      <div class="label" style="margin-top:8px;">Status</div>
      <div class="row">
        <label><input type="checkbox" data-role="status" value="todo" /> todo</label>
        <label><input type="checkbox" data-role="status" value="doing" /> doing</label>
        <label><input type="checkbox" data-role="status" value="done" /> done</label>
      </div>
      <div class="label" style="margin-top:8px;">Issues</div>
      <div class="row">
        <label><input type="checkbox" data-role="issueHas" value="has" /> has</label>
        <label><input type="checkbox" data-role="issueHas" value="none" /> none</label>
      </div>
      <div class="row">
        <label><input type="checkbox" data-role="issueStatus" value="open" /> open</label>
        <label><input type="checkbox" data-role="issueStatus" value="doing" /> doing</label>
        <label><input type="checkbox" data-role="issueStatus" value="resolved" /> resolved</label>
        <label><input type="checkbox" data-role="issueStatus" value="pending" /> pending</label>
      </div>
    </div>

    <script>
      const vscode = acquireVsCodeApi();
      const rootPathEl = document.getElementById("rootPath");
      const tagsEl = document.getElementById("tags");
      const ownersEl = document.getElementById("owners");
      const statusEl = document.getElementById("status");
      const statusChecks = Array.from(document.querySelectorAll('input[data-role="status"]'));
      const issueHasChecks = Array.from(document.querySelectorAll('input[data-role="issueHas"]'));
      const issueStatusChecks = Array.from(document.querySelectorAll('input[data-role="issueStatus"]'));
      const selectedValues = (nodes) => nodes.filter((node) => node.checked).map((node) => node.value);
      const setChecks = (nodes, values) => {
        const set = new Set(values || []);
        nodes.forEach((node) => {
          node.checked = set.has(node.value);
        });
      };

      document.getElementById("setRoot").addEventListener("click", () => {
        vscode.postMessage({ type: "setRoot", path: rootPathEl.value.trim() });
      });
      document.getElementById("browseRoot").addEventListener("click", () => {
        vscode.postMessage({ type: "browseRoot" });
      });
      document.getElementById("applySearch").addEventListener("click", () => {
        vscode.postMessage({
          type: "applySearch",
          tags: tagsEl.value,
          owners: ownersEl.value,
          testcaseStatus: selectedValues(statusChecks),
          issueHas: selectedValues(issueHasChecks),
          issueStatus: selectedValues(issueStatusChecks)
        });
      });
      document.getElementById("clearSearch").addEventListener("click", () => {
        vscode.postMessage({ type: "clearSearch" });
      });

      window.addEventListener("message", (event) => {
        const msg = event.data;
        if (msg.type === "state") {
          rootPathEl.value = msg.root || "";
          tagsEl.value = (msg.filters?.tags || []).join(", ");
          ownersEl.value = (msg.filters?.owners || []).join(", ");
          setChecks(statusChecks, msg.filters?.testcaseStatus || []);
          setChecks(issueHasChecks, msg.filters?.issueHas || []);
          setChecks(issueStatusChecks, msg.filters?.issueStatus || []);
          statusEl.textContent = msg.status || "";
        }
      });

      vscode.postMessage({ type: "ready" });
    </script>
  </body>
</html>`;
}

function managerHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: ui-sans-serif, system-ui; margin: 0; padding: 16px; background: #f5f7fa; }
      .panel { background: #fff; border: 1px solid #d7dde6; border-radius: 8px; padding: 12px; margin-bottom: 10px; }
      input, textarea, select, button { font: inherit; border-radius: 6px; border: 1px solid #c6ced9; padding: 6px 8px; }
      button { background: #0b5fff; color: #fff; border: none; cursor: pointer; }
      button.secondary { background: #5a6a7f; }
      .card { border: 1px solid #d7dde6; border-radius: 8px; padding: 10px; margin-top: 8px; }
      .muted { color: #5f7288; font-size: 12px; }
      .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .iconBtn { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #c6ced9; background: #ffffff; color: #334155; cursor: pointer; }
      .iconBtn svg { width: 14px; height: 14px; }
      .field { display: grid; grid-template-columns: 170px 1fr; gap: 8px; align-items: center; margin-top: 6px; }
      .field > label { font-size: 12px; color: #5f7288; }
      .rangeLine { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; }
      .chips { border: 1px solid #c6ced9; border-radius: 6px; padding: 6px; min-height: 36px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; background: #fff; }
      .chip { background: #eef2f7; color: #334155; border-radius: 12px; padding: 2px 8px; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
      .chip button { background: transparent; color: #334155; border: none; padding: 0; cursor: pointer; }
      .chipInput { border: none; outline: none; min-width: 140px; flex: 1; padding: 2px; }
      .listRow { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; margin-top: 6px; }
      .bulletItem { border-top: 1px solid #e5eaf1; padding-top: 8px; margin-top: 8px; }
      .suiteCaseLine { display: grid; grid-template-columns: 180px 1fr 90px auto; gap: 8px; align-items: center; border-top: 1px solid #e5eaf1; padding-top: 6px; margin-top: 6px; }
    </style>
  </head>
  <body>
    <section class="panel">
      <h3>Detail</h3>
      <div id="status" class="muted"></div>
      <div id="detail"></div>
    </section>
    <script>
      const vscode = acquireVsCodeApi();
      const statusEl = document.getElementById('status');
      const detailEl = document.getElementById('detail');
      let snapshot = { root: '', suites: [], cases: [], selectedSuite: null, selectedCase: null, suiteCases: [] };
      function esc(v){ return (v || '').replace(/"/g, '&quot;'); }
      function fileIcon() {
        return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 1.5h6.8L13 4.7V14.5H3z" stroke="currentColor" stroke-width="1.2"/><path d="M9.8 1.5v3.2H13" stroke="currentColor" stroke-width="1.2"/></svg>';
      }
      function createChipEditor(root, initialValues) {
        let values = [...(initialValues || [])];
        const chips = root.querySelector('[data-role="chips"]');
        const input = root.querySelector('[data-role="chipInput"]');
        const render = () => {
          chips.innerHTML = '';
          for (const value of values) {
            const el = document.createElement('span');
            el.className = 'chip';
            el.innerHTML = '<span>' + esc(value) + '</span><button type="button">x</button>';
            el.querySelector('button').addEventListener('click', () => {
              values = values.filter((v) => v !== value);
              render();
            });
            chips.appendChild(el);
          }
          chips.appendChild(input);
        };
        const pushInput = () => {
          const raw = input.value.trim();
          if (!raw) return;
          const next = raw.split(',').map((v) => v.trim()).filter((v) => v.length > 0);
          values = Array.from(new Set(values.concat(next)));
          input.value = '';
          render();
        };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            pushInput();
          }
        });
        input.addEventListener('blur', () => pushInput());
        render();
        return { getValues: () => values.slice() };
      }
      function createSuiteCard(suite) {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML =
          '<div class="head"><div><strong>' + suite.id + '</strong> <span class="muted">' + suite.path + '</span></div><button class="iconBtn" data-role="openRaw" title="Open YAML" aria-label="Open YAML">' + fileIcon() + '</button></div>' +
          '<div class="field"><label>id</label><input value="' + esc(suite.id) + '" readonly /></div>' +
          '<div class="field"><label>title</label><input data-role="title" value="' + esc(suite.title) + '" /></div>' +
          '<div class="field"><label>tags</label><div data-role="tagsEditor" class="chips"><div data-role="chips"></div><input data-role="chipInput" class="chipInput" placeholder="comma or enter" /></div></div>' +
          '<div class="field"><label>owners</label><div data-role="ownersEditor" class="chips"><div data-role="chips"></div><input data-role="chipInput" class="chipInput" placeholder="comma or enter" /></div></div>' +
          '<div class="field"><label>scoped</label><label><input data-role="scoped" type="checkbox" ' + (suite.scoped ? 'checked' : '') + ' /> scoped</label></div>' +
          '<div class="field"><label>related</label><input data-role="related" value="' + esc((suite.related || []).join(',')) + '" placeholder="related ids (csv)" /></div>' +
          '<div class="field"><label>scheduled</label><div class="rangeLine"><input data-role="scheduledStart" type="date" value="' + esc(suite.duration?.scheduled?.start || '') + '" /><span>-</span><input data-role="scheduledEnd" type="date" value="' + esc(suite.duration?.scheduled?.end || '') + '" /></div></div>' +
          '<div class="field"><label>actual</label><div class="rangeLine"><input data-role="actualStart" type="date" value="' + esc(suite.duration?.actual?.start || '') + '" /><span>-</span><input data-role="actualEnd" type="date" value="' + esc(suite.duration?.actual?.end || '') + '" /></div></div>' +
          '<div class="field"><label>description</label><textarea data-role="description" rows="2">' + esc(suite.description || '') + '</textarea></div>' +
          '<div class="field"><label>remarks</label><textarea data-role="remarks" rows="3" placeholder="one per line">' + esc((suite.remarks || []).join('\\n')) + '</textarea></div>' +
          '<div style="margin-top:8px;"><button data-role="save">Save Suite</button></div>';
        const tagsEditor = createChipEditor(card.querySelector('[data-role="tagsEditor"]'), suite.tags || []);
        const ownersEditor = createChipEditor(card.querySelector('[data-role="ownersEditor"]'), suite.owners || []);
        card.querySelector('[data-role="openRaw"]').addEventListener('click', () => vscode.postMessage({ type: 'openRaw', path: suite.path }));
        card.querySelector('[data-role="save"]').addEventListener('click', () => {
          vscode.postMessage({
            type: 'saveSuite',
            path: suite.path,
            title: card.querySelector('[data-role="title"]').value,
            description: card.querySelector('[data-role="description"]').value,
            tags: tagsEditor.getValues().join(','),
            owners: ownersEditor.getValues().join(','),
            scoped: card.querySelector('[data-role="scoped"]').checked,
            scheduledStart: card.querySelector('[data-role="scheduledStart"]').value,
            scheduledEnd: card.querySelector('[data-role="scheduledEnd"]').value,
            actualStart: card.querySelector('[data-role="actualStart"]').value,
            actualEnd: card.querySelector('[data-role="actualEnd"]').value,
            related: card.querySelector('[data-role="related"]').value,
            remarks: card.querySelector('[data-role="remarks"]').value
          });
        });
        return card;
      }
      function createNumberedList(listEl, values) {
        const renumber = () => {
          let i = 1;
          for (const row of listEl.querySelectorAll('[data-role="list-row"]')) {
            row.querySelector('[data-role="index"]').textContent = String(i) + '.';
            i += 1;
          }
        };
        const add = (value = '') => {
          const row = document.createElement('div');
          row.className = 'listRow';
          row.setAttribute('data-role', 'list-row');
          row.innerHTML = '<span data-role="index">1.</span><input data-role="value" value="' + esc(value) + '" /><button class="secondary" type="button" data-role="remove">Remove</button>';
          row.querySelector('[data-role="remove"]').addEventListener('click', () => { row.remove(); renumber(); });
          listEl.appendChild(row);
          renumber();
        };
        for (const v of values || []) add(v);
        return {
          add,
          values: () => Array.from(listEl.querySelectorAll('[data-role="value"]')).map((el) => el.value.trim()).filter((v) => v.length > 0)
        };
      }
      function createTestsEditor(root, tests) {
        const list = root.querySelector('[data-role="testsList"]');
        const add = (item = { name: '', expected: '', actual: '', trails: [], status: null }) => {
          const row = document.createElement('div');
          row.className = 'bulletItem';
          row.setAttribute('data-role', 'test-item');
          const status = item.status || '';
          row.innerHTML =
            '<div class="muted">・Test</div>' +
            '<div class="field"><label>name</label><input data-key="name" value="' + esc(item.name || '') + '" /></div>' +
            '<div class="field"><label>expected</label><textarea data-key="expected" rows="2">' + esc(item.expected || '') + '</textarea></div>' +
            '<div class="field"><label>actual</label><textarea data-key="actual" rows="2">' + esc(item.actual || '') + '</textarea></div>' +
            '<div class="field"><label>trails</label><input data-key="trails" value="' + esc((item.trails || []).join(',')) + '" placeholder="csv" /></div>' +
            '<div class="field"><label>status</label><select data-key="status">' +
              '<option value="" ' + (status === '' ? 'selected' : '') + '>null</option>' +
              '<option value="pass" ' + (status === 'pass' ? 'selected' : '') + '>pass</option>' +
              '<option value="fail" ' + (status === 'fail' ? 'selected' : '') + '>fail</option>' +
              '<option value="skip" ' + (status === 'skip' ? 'selected' : '') + '>skip</option>' +
              '<option value="block" ' + (status === 'block' ? 'selected' : '') + '>block</option>' +
            '</select></div>' +
            '<div><button class="secondary" data-role="remove" type="button">Remove Test</button></div>';
          row.querySelector('[data-role="remove"]').addEventListener('click', () => row.remove());
          list.appendChild(row);
        };
        for (const t of tests || []) add(t);
        return {
          add,
          values: () => Array.from(list.querySelectorAll('[data-role="test-item"]')).map((row) => ({
            name: row.querySelector('[data-key="name"]').value.trim(),
            expected: row.querySelector('[data-key="expected"]').value,
            actual: row.querySelector('[data-key="actual"]').value,
            trails: row.querySelector('[data-key="trails"]').value.split(',').map((v) => v.trim()).filter((v) => v.length > 0),
            status: row.querySelector('[data-key="status"]').value || null
          })).filter((t) => t.name.length > 0)
        };
      }
      function createIssuesEditor(root, issues) {
        const list = root.querySelector('[data-role="issuesList"]');
        const add = (issue = { incident: '', owners: [], cause: [], solution: [], status: 'open', completedDay: null, related: [], remarks: [] }) => {
          const row = document.createElement('div');
          row.className = 'bulletItem';
          row.setAttribute('data-role', 'issue-item');
          row.innerHTML =
            '<div class="muted">・Issue</div>' +
            '<div class="field"><label>incident</label><input data-key="incident" value="' + esc(issue.incident || '') + '" /></div>' +
            '<div class="field"><label>owners</label><input data-key="owners" value="' + esc((issue.owners || []).join(',')) + '" placeholder="csv" /></div>' +
            '<div class="field"><label>cause</label><textarea data-key="cause" rows="2" placeholder="one per line">' + esc((issue.cause || []).join('\\n')) + '</textarea></div>' +
            '<div class="field"><label>solution</label><textarea data-key="solution" rows="2" placeholder="one per line">' + esc((issue.solution || []).join('\\n')) + '</textarea></div>' +
            '<div class="field"><label>status</label><select data-key="status"><option value="open"' + (issue.status==='open'?' selected':'') + '>open</option><option value="doing"' + (issue.status==='doing'?' selected':'') + '>doing</option><option value="resolved"' + (issue.status==='resolved'?' selected':'') + '>resolved</option><option value="pending"' + (issue.status==='pending'?' selected':'') + '>pending</option></select></div>' +
            '<div class="field"><label>completedDay</label><input data-key="completedDay" type="date" value="' + esc(issue.completedDay || '') + '" /></div>' +
            '<div class="field"><label>related</label><input data-key="related" value="' + esc((issue.related || []).join(',')) + '" placeholder="csv" /></div>' +
            '<div class="field"><label>remarks</label><textarea data-key="remarks" rows="2" placeholder="one per line">' + esc((issue.remarks || []).join('\\n')) + '</textarea></div>' +
            '<div><button class="secondary" data-role="remove" type="button">Remove Issue</button></div>';
          row.querySelector('[data-role="remove"]').addEventListener('click', () => row.remove());
          list.appendChild(row);
        };
        for (const i of issues || []) add(i);
        return {
          add,
          values: () => Array.from(list.querySelectorAll('[data-role="issue-item"]')).map((row) => ({
            incident: row.querySelector('[data-key="incident"]').value.trim(),
            owners: row.querySelector('[data-key="owners"]').value.split(',').map((v) => v.trim()).filter((v) => v.length > 0),
            cause: row.querySelector('[data-key="cause"]').value.split(/\\r?\\n/).map((v) => v.trim()).filter((v) => v.length > 0),
            solution: row.querySelector('[data-key="solution"]').value.split(/\\r?\\n/).map((v) => v.trim()).filter((v) => v.length > 0),
            status: row.querySelector('[data-key="status"]').value,
            completedDay: row.querySelector('[data-key="completedDay"]').value || null,
            related: row.querySelector('[data-key="related"]').value.split(',').map((v) => v.trim()).filter((v) => v.length > 0),
            remarks: row.querySelector('[data-key="remarks"]').value.split(/\\r?\\n/).map((v) => v.trim()).filter((v) => v.length > 0)
          })).filter((i) => i.incident.length > 0)
        };
      }
      function createCaseCard(testCase) {
        const selectedNull = testCase.status === null ? 'selected' : '';
        const selectedTodo = testCase.status === 'todo' ? 'selected' : '';
        const selectedDoing = testCase.status === 'doing' ? 'selected' : '';
        const selectedDone = testCase.status === 'done' ? 'selected' : '';
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML =
          '<div class="head"><div><strong>' + testCase.id + '</strong> <span class="muted">' + testCase.path + '</span></div><button class="iconBtn" data-role="openRaw" title="Open YAML" aria-label="Open YAML">' + fileIcon() + '</button></div>' +
          '<div class="field"><label>id</label><input value="' + esc(testCase.id) + '" readonly /></div>' +
          '<div class="field"><label>title</label><input data-role="title" value="' + esc(testCase.title) + '" /></div>' +
          '<div class="field"><label>tags</label><input data-role="tags" value="' + esc((testCase.tags || []).join(',')) + '" placeholder="csv" /></div>' +
          '<div class="field"><label>scoped</label><label><input data-role="scoped" type="checkbox" ' + (testCase.scoped ? 'checked' : '') + ' /> scoped</label></div>' +
          '<div class="field"><label>status</label><select data-role="status"><option value="" ' + selectedNull + '>null</option><option value="todo" ' + selectedTodo + '>todo</option><option value="doing" ' + selectedDoing + '>doing</option><option value="done" ' + selectedDone + '>done</option></select></div>' +
          '<div class="field"><label>description</label><textarea data-role="description" rows="3">' + esc(testCase.description || '') + '</textarea></div>' +
          '<div class="field"><label>operations</label><div><div data-role="operationsList"></div><button data-role="addOp" class="secondary" type="button" style="margin-top:6px;">Add Step</button></div></div>' +
          '<div class="field"><label>related</label><input data-role="related" value="' + esc((testCase.related || []).join(',')) + '" placeholder="csv" /></div>' +
          '<div class="field"><label>completedDay</label><input data-role="completedDay" type="date" value="' + esc(testCase.completedDay || '') + '" /></div>' +
          '<div class="field"><label>remarks</label><textarea data-role="remarks" rows="3" placeholder="one per line">' + esc((testCase.remarks || []).join('\\n')) + '</textarea></div>' +
          '<div class="field"><label>tests</label><div><div data-role="testsList"></div><button data-role="addTest" class="secondary" type="button" style="margin-top:6px;">Add Test</button></div></div>' +
          '<div class="field"><label>issues</label><div><div data-role="issuesList"></div><button data-role="addIssue" class="secondary" type="button" style="margin-top:6px;">Add Issue</button></div></div>' +
          '<div style="margin-top:8px;"><button data-role="save">Save Case</button></div>';
        const ops = createNumberedList(card.querySelector('[data-role="operationsList"]'), testCase.operations || []);
        card.querySelector('[data-role="addOp"]').addEventListener('click', () => ops.add(''));
        const testsEditor = createTestsEditor(card, testCase.tests || []);
        card.querySelector('[data-role="addTest"]').addEventListener('click', () => testsEditor.add());
        const issuesEditor = createIssuesEditor(card, testCase.issues || []);
        card.querySelector('[data-role="addIssue"]').addEventListener('click', () => issuesEditor.add());
        card.querySelector('[data-role="openRaw"]').addEventListener('click', () => vscode.postMessage({ type: 'openRaw', path: testCase.path }));
        card.querySelector('[data-role="save"]').addEventListener('click', () => {
          vscode.postMessage({
            type: 'saveCase',
            path: testCase.path,
            title: card.querySelector('[data-role="title"]').value,
            description: card.querySelector('[data-role="description"]').value,
            tags: card.querySelector('[data-role="tags"]').value,
            scoped: card.querySelector('[data-role="scoped"]').checked,
            status: card.querySelector('[data-role="status"]').value || null,
            operations: ops.values(),
            related: card.querySelector('[data-role="related"]').value,
            remarks: card.querySelector('[data-role="remarks"]').value,
            completedDay: card.querySelector('[data-role="completedDay"]').value,
            tests: testsEditor.values(),
            issues: issuesEditor.values()
          });
        });
        return card;
      }
      function render() {
        statusEl.textContent = 'root=' + (snapshot.root || '-') + ' suites=' + snapshot.suites.length + ' cases=' + snapshot.cases.length;
        detailEl.innerHTML = '';
        if (snapshot.selectedSuite) {
          const title = document.createElement('h4');
          title.textContent = 'Suite Editor';
          detailEl.appendChild(title);
          detailEl.appendChild(createSuiteCard(snapshot.selectedSuite));
          const casesTitle = document.createElement('h4');
          casesTitle.style.marginTop = '12px';
          casesTitle.textContent = 'Cases in Suite';
          detailEl.appendChild(casesTitle);
          for (const testCase of snapshot.suiteCases || []) {
            const line = document.createElement('div');
            line.className = 'suiteCaseLine';
            line.innerHTML = '<span>' + esc(testCase.id) + '</span><span>' + esc(testCase.title || '') + '</span><span class="muted">' + esc(testCase.status || 'null') + '</span><button class="iconBtn" data-role="openCaseRaw" title="Open YAML" aria-label="Open YAML">' + fileIcon() + '</button>';
            line.querySelector('[data-role="openCaseRaw"]').addEventListener('click', () => vscode.postMessage({ type: 'openRaw', path: testCase.path }));
            detailEl.appendChild(line);
          }
          return;
        }
        if (snapshot.selectedCase) {
          const title = document.createElement('h4');
          title.textContent = 'Case Editor';
          detailEl.appendChild(title);
          detailEl.appendChild(createCaseCard(snapshot.selectedCase));
          return;
        }
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = 'Select a suite or case from the tree to edit.';
        detailEl.appendChild(empty);
      }
      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'snapshot') {
          snapshot = msg.payload;
          render();
        }
        if (msg.type === 'error') {
          statusEl.textContent = 'Error: ' + msg.message;
        }
      });
      vscode.postMessage({ type: 'ready' });
    </script>
  </body>
</html>`;
}

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
  const provider = new TlogTreeDataProvider(vscodeApi, context);
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
