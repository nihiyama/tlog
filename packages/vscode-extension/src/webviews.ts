export function controlsHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background: var(--vscode-sideBar-background);
        margin: 0;
        padding: 10px;
      }
      .box {
        border: 1px solid var(--vscode-editorWidget-border);
        border-radius: 6px;
        padding: 10px;
        margin-bottom: 10px;
        background: var(--vscode-editorWidget-background);
      }
      .row { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
      .field { margin-top: 8px; }
      .label {
        display: inline-block;
        font-size: 11px;
        opacity: 0.9;
        margin-bottom: 4px;
      }
      .searchRow {
        display: flex;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        padding: 4px 6px;
        background: var(--vscode-input-background);
      }
      .searchIcon { width: 14px; height: 14px; opacity: 0.8; }
      input {
        width: 100%;
        min-width: 0;
        padding: 4px 6px;
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
      }
      .searchRow input { border: none; padding: 0; background: transparent; }
      button {
        border: 1px solid var(--vscode-button-border, transparent);
        border-radius: 4px;
        padding: 3px 8px;
        cursor: pointer;
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }
      button.secondary {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
      }
      button.ghost {
        background: transparent;
        color: var(--vscode-foreground);
        border-color: var(--vscode-input-border);
      }
      details {
        margin-top: 8px;
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
      }
      summary {
        cursor: pointer;
        list-style: none;
        padding: 6px 8px;
        font-size: 12px;
      }
      summary::-webkit-details-marker { display: none; }
      .detailsBody {
        border-top: 1px solid var(--vscode-input-border);
        padding: 8px;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 6px;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        border-radius: 10px;
        border: 1px solid var(--vscode-badge-background);
        background: var(--vscode-badge-background);
        color: var(--vscode-badge-foreground);
        font-size: 11px;
        padding: 1px 6px;
      }
      .chip button {
        border: none;
        background: transparent;
        color: inherit;
        padding: 0;
        line-height: 1;
      }
      .multiWrap { margin-top: 6px; position: relative; }
      .multiTrigger {
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        text-align: left;
      }
      .multiPanel {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        z-index: 20;
        background: var(--vscode-editorWidget-background);
        border: 1px solid var(--vscode-editorWidget-border);
        border-radius: 4px;
        padding: 6px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
      }
      .multiPanel.hidden { display: none; }
      .multiPanelBody {
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        padding: 6px;
        max-height: 150px;
        overflow: auto;
        background: var(--vscode-input-background);
      }
      .multiOption {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 6px;
        margin: 0 0 4px 0;
        font-size: 12px;
        line-height: 1.2;
        text-align: left;
        width: 100%;
      }
      .multiOption:last-child { margin-bottom: 0; }
      .multiOption input[type="checkbox"] { margin: 0; width: 14px; height: 14px; flex: 0 0 auto; }
      .multiOption span { display: inline-block; text-align: left; white-space: nowrap; }
      .caret { font-size: 10px; opacity: 0.8; }
      #status { font-size: 11px; opacity: 0.9; margin-top: 6px; min-height: 16px; }
    </style>
  </head>
  <body>
    <div class="box">
      <label class="label" for="rootPath">Root directory</label>
      <input id="rootPath" aria-label="tlog root directory" placeholder="tlog root directory" />
      <div class="row">
        <button id="setRoot">Set Root</button>
        <button id="browseRoot" class="secondary">Browse</button>
      </div>
      <div id="status" aria-live="polite"></div>
    </div>

    <div class="box">
      <div class="label">Search</div>
      <div class="field">
        <div class="label">Quick filters</div>
        <label class="multiOption" style="margin-top:4px;">
          <input id="scopedOnly" type="checkbox" aria-label="scoped only" />
          <span>Scoped only</span>
        </label>
      </div>
      <div class="field">
        <label class="label" for="tags">Tags</label>
        <div class="searchRow">
          <svg class="searchIcon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4"></circle>
            <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
          </svg>
          <input id="tags" aria-label="search tags" placeholder="smoke, regression" />
        </div>
      </div>
      <div class="field">
        <label class="label" for="owners">Owners</label>
        <div class="searchRow">
          <svg class="searchIcon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4"></circle>
            <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
          </svg>
          <input id="owners" aria-label="search owners" placeholder="qa-team" />
        </div>
      </div>

      <details id="advancedFilters">
        <summary>Advanced filters</summary>
        <div class="detailsBody">
          <div class="label">Case status</div>
          <div class="multiWrap">
            <button id="statusTrigger" class="multiTrigger ghost" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="statusPanel">
              <span data-role="triggerLabel">Select status</span>
              <span class="caret">▼</span>
            </button>
            <div id="statusPanel" class="multiPanel hidden" role="listbox" aria-label="Case status">
              <div id="statusSelect" class="multiPanelBody">
                <label class="multiOption"><input type="checkbox" value="todo" /><span>todo</span></label>
                <label class="multiOption"><input type="checkbox" value="doing" /><span>doing</span></label>
                <label class="multiOption"><input type="checkbox" value="done" /><span>done</span></label>
              </div>
            </div>
          </div>

          <div class="label" style="margin-top:8px;">Issues presence</div>
          <div class="multiWrap">
            <button id="issueHasTrigger" class="multiTrigger ghost" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="issueHasPanel">
              <span data-role="triggerLabel">Select issue presence</span>
              <span class="caret">▼</span>
            </button>
            <div id="issueHasPanel" class="multiPanel hidden" role="listbox" aria-label="Issue presence">
              <div id="issueHasSelect" class="multiPanelBody">
                <label class="multiOption"><input type="checkbox" value="has" /><span>has</span></label>
                <label class="multiOption"><input type="checkbox" value="none" /><span>none</span></label>
              </div>
            </div>
          </div>

          <div class="label" style="margin-top:8px;">Issue status</div>
          <div class="multiWrap">
            <button id="issueStatusTrigger" class="multiTrigger ghost" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="issueStatusPanel">
              <span data-role="triggerLabel">Select issue status</span>
              <span class="caret">▼</span>
            </button>
            <div id="issueStatusPanel" class="multiPanel hidden" role="listbox" aria-label="Issue status">
              <div id="issueStatusSelect" class="multiPanelBody">
                <label class="multiOption"><input type="checkbox" value="open" /><span>open</span></label>
                <label class="multiOption"><input type="checkbox" value="doing" /><span>doing</span></label>
                <label class="multiOption"><input type="checkbox" value="resolved" /><span>resolved</span></label>
                <label class="multiOption"><input type="checkbox" value="pending" /><span>pending</span></label>
              </div>
            </div>
          </div>
        </div>
      </details>

      <div class="field">
        <div class="label">Active filters</div>
        <div id="activeFilters" class="chips"></div>
      </div>

      <div class="row" style="margin-top:8px;">
        <button id="applySearch">Apply</button>
        <button id="clearSearch" class="secondary">Clear all filters</button>
      </div>
    </div>

    <script>
      const vscode = acquireVsCodeApi();
      const rootPathEl = document.getElementById("rootPath");
      const scopedOnlyEl = document.getElementById("scopedOnly");
      const tagsEl = document.getElementById("tags");
      const ownersEl = document.getElementById("owners");
      const statusEl = document.getElementById("status");
      const activeFiltersEl = document.getElementById("activeFilters");
      const statusSelect = document.getElementById("statusSelect");
      const issueHasSelect = document.getElementById("issueHasSelect");
      const issueStatusSelect = document.getElementById("issueStatusSelect");
      const statusTrigger = document.getElementById("statusTrigger");
      const issueHasTrigger = document.getElementById("issueHasTrigger");
      const issueStatusTrigger = document.getElementById("issueStatusTrigger");
      const statusPanel = document.getElementById("statusPanel");
      const issueHasPanel = document.getElementById("issueHasPanel");
      const issueStatusPanel = document.getElementById("issueStatusPanel");
      const advancedFiltersEl = document.getElementById("advancedFilters");
      const getChecks = (root) => Array.from(root.querySelectorAll('input[type="checkbox"]'));
      const selectedValues = (root) => getChecks(root).filter((el) => el.checked).map((el) => el.value);
      const setSelectValues = (root, values) => {
        const set = new Set(values || []);
        getChecks(root).forEach((el) => {
          el.checked = set.has(el.value);
        });
      };
      const currentFilterState = () => ({
        scopedOnly: scopedOnlyEl.checked,
        tags: tagsEl.value,
        owners: ownersEl.value,
        testcaseStatus: selectedValues(statusSelect),
        issueHas: selectedValues(issueHasSelect),
        issueStatus: selectedValues(issueStatusSelect)
      });
      const closeAllPanels = () => {
        statusPanel.classList.add("hidden");
        issueHasPanel.classList.add("hidden");
        issueStatusPanel.classList.add("hidden");
        statusTrigger.setAttribute("aria-expanded", "false");
        issueHasTrigger.setAttribute("aria-expanded", "false");
        issueStatusTrigger.setAttribute("aria-expanded", "false");
      };
      const postApply = () => {
        vscode.postMessage({ type: "applySearch", ...currentFilterState() });
      };
      const refreshTrigger = (root, trigger, fallback) => {
        const picked = selectedValues(root);
        const label = trigger.querySelector('[data-role="triggerLabel"]');
        label.textContent = picked.length > 0 ? picked.join(", ") : fallback;
      };
      const bindMulti = (trigger, panel, root, fallback) => {
        trigger.addEventListener("click", (event) => {
          event.stopPropagation();
          const isOpen = !panel.classList.contains("hidden");
          closeAllPanels();
          if (!isOpen) {
            panel.classList.remove("hidden");
            trigger.setAttribute("aria-expanded", "true");
          }
        });
        panel.addEventListener("click", (event) => event.stopPropagation());
        panel.addEventListener("change", () => {
          refreshTrigger(root, trigger, fallback);
          renderActiveFilters();
        });
        refreshTrigger(root, trigger, fallback);
      };
      const parseCsv = (text) =>
        text
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length > 0);
      const renderActiveFilters = () => {
        const state = currentFilterState();
        const chips = [];
        if (state.scopedOnly) chips.push({ key: "scopedOnly", value: "scoped" });
        parseCsv(state.tags).forEach((value) => chips.push({ key: "tag", value }));
        parseCsv(state.owners).forEach((value) => chips.push({ key: "owner", value }));
        state.testcaseStatus.forEach((value) => chips.push({ key: "status", value }));
        state.issueHas.forEach((value) => chips.push({ key: "issueHas", value }));
        state.issueStatus.forEach((value) => chips.push({ key: "issueStatus", value }));
        activeFiltersEl.innerHTML = "";
        if (chips.length === 0) {
          const empty = document.createElement("span");
          empty.className = "label";
          empty.textContent = "No active filters";
          activeFiltersEl.appendChild(empty);
          return;
        }
        for (const chip of chips) {
          const el = document.createElement("span");
          el.className = "chip";
          el.innerHTML = '<span>' + chip.key + ":" + chip.value + '</span><button type="button" aria-label="Remove filter">x</button>';
          el.querySelector("button").addEventListener("click", () => {
            if (chip.key === "scopedOnly") {
              scopedOnlyEl.checked = false;
            } else if (chip.key === "tag") {
              const next = parseCsv(tagsEl.value).filter((item) => item !== chip.value);
              tagsEl.value = next.join(", ");
            } else if (chip.key === "owner") {
              const next = parseCsv(ownersEl.value).filter((item) => item !== chip.value);
              ownersEl.value = next.join(", ");
            } else if (chip.key === "status") {
              const next = selectedValues(statusSelect).filter((item) => item !== chip.value);
              setSelectValues(statusSelect, next);
              refreshTrigger(statusSelect, statusTrigger, "Select status");
            } else if (chip.key === "issueHas") {
              const next = selectedValues(issueHasSelect).filter((item) => item !== chip.value);
              setSelectValues(issueHasSelect, next);
              refreshTrigger(issueHasSelect, issueHasTrigger, "Select issue presence");
            } else if (chip.key === "issueStatus") {
              const next = selectedValues(issueStatusSelect).filter((item) => item !== chip.value);
              setSelectValues(issueStatusSelect, next);
              refreshTrigger(issueStatusSelect, issueStatusTrigger, "Select issue status");
            }
            renderActiveFilters();
            postApply();
          });
          activeFiltersEl.appendChild(el);
        }
      };

      bindMulti(statusTrigger, statusPanel, statusSelect, "Select status");
      bindMulti(issueHasTrigger, issueHasPanel, issueHasSelect, "Select issue presence");
      bindMulti(issueStatusTrigger, issueStatusPanel, issueStatusSelect, "Select issue status");
      document.addEventListener("click", () => closeAllPanels());
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeAllPanels();
          statusTrigger.focus();
        }
      });
      scopedOnlyEl.addEventListener("change", renderActiveFilters);
      tagsEl.addEventListener("input", renderActiveFilters);
      ownersEl.addEventListener("input", renderActiveFilters);
      advancedFiltersEl.addEventListener("toggle", closeAllPanels);

      document.getElementById("setRoot").addEventListener("click", () => {
        vscode.postMessage({ type: "setRoot", path: rootPathEl.value.trim() });
      });
      document.getElementById("browseRoot").addEventListener("click", () => {
        vscode.postMessage({ type: "browseRoot" });
      });
      document.getElementById("applySearch").addEventListener("click", () => {
        postApply();
      });
      document.getElementById("clearSearch").addEventListener("click", () => {
        vscode.postMessage({ type: "clearSearch" });
      });

      window.addEventListener("message", (event) => {
        const msg = event.data;
        if (msg.type === "state") {
          rootPathEl.value = msg.root || "";
          scopedOnlyEl.checked = Boolean(msg.filters?.scopedOnly);
          tagsEl.value = (msg.filters?.tags || []).join(", ");
          ownersEl.value = (msg.filters?.owners || []).join(", ");
          setSelectValues(statusSelect, msg.filters?.testcaseStatus || []);
          setSelectValues(issueHasSelect, msg.filters?.issueHas || []);
          setSelectValues(issueStatusSelect, msg.filters?.issueStatus || []);
          refreshTrigger(statusSelect, statusTrigger, "Select status");
          refreshTrigger(issueHasSelect, issueHasTrigger, "Select issue presence");
          refreshTrigger(issueStatusSelect, issueStatusTrigger, "Select issue status");
          renderActiveFilters();
          statusEl.textContent = msg.status || "";
        }
      });

      vscode.postMessage({ type: "ready" });
    </script>
  </body>
</html>`;
}

export function managerHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        margin: 0;
        padding: 12px;
        background: var(--vscode-editor-background);
      }
      .panel {
        background: var(--vscode-editorWidget-background);
        border: 1px solid var(--vscode-editorWidget-border);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 10px;
      }
      input, textarea, select, button {
        font: inherit;
        border-radius: 4px;
        border: 1px solid var(--vscode-input-border);
        padding: 6px 8px;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
      }
      button {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: 1px solid var(--vscode-button-border, transparent);
        cursor: pointer;
      }
      button.secondary {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
      }
      .topBar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }
      .context {
        font-size: 12px;
        opacity: 0.9;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .saveState {
        font-size: 11px;
        border-radius: 999px;
        border: 1px solid var(--vscode-editorWidget-border);
        padding: 1px 8px;
      }
      .saveState.saving { color: var(--vscode-descriptionForeground); }
      .saveState.saved { color: var(--vscode-testing-iconPassed); }
      .saveState.error { color: var(--vscode-errorForeground); }
      .card {
        border: 1px solid var(--vscode-editorWidget-border);
        border-radius: 8px;
        padding: 10px;
        margin-top: 8px;
        background: var(--vscode-editorWidget-background);
      }
      .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
      .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .iconBtn {
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--vscode-input-border);
        background: var(--vscode-input-background);
        color: var(--vscode-foreground);
        cursor: pointer;
      }
      .iconBtn svg { width: 14px; height: 14px; }
      .field { display: grid; grid-template-columns: 170px 1fr; gap: 8px; align-items: start; margin-top: 8px; }
      .field > label { font-size: 12px; color: var(--vscode-descriptionForeground); padding-top: 7px; }
      .overviewRows {
        display: grid;
        gap: 8px;
        margin-top: 8px;
        border: 1px solid var(--vscode-input-border);
        border-radius: 6px;
        padding: 8px;
      }
      .overviewRow {
        display: grid;
        grid-template-columns: 220px 1fr;
        gap: 8px;
        align-items: start;
      }
      .overviewRow.meta {
        grid-template-columns: 140px 1fr 1fr;
      }
      .overviewRows .stack {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .overviewRows .stack label {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
      }
      .overviewRows .stack.inlineCheckbox {
        flex-direction: row;
        align-items: center;
        gap: 8px;
        padding-top: 21px;
      }
      .rangeLine { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; }
      .chips {
        border: 1px solid var(--vscode-input-border);
        border-radius: 6px;
        padding: 6px;
        min-height: 36px;
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        align-items: center;
        background: var(--vscode-input-background);
      }
      .chip {
        background: var(--vscode-badge-background);
        color: var(--vscode-badge-foreground);
        border-radius: 12px;
        padding: 2px 8px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        border: 1px solid var(--vscode-badge-background);
      }
      .chip button { background: transparent; color: inherit; border: none; padding: 0; cursor: pointer; }
      .chipLink { background: transparent; color: var(--vscode-textLink-foreground); border: none; padding: 0; cursor: pointer; text-decoration: underline; }
      .chipInput { border: none; outline: none; min-width: 140px; flex: 1; padding: 2px; }
      .listRow { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; margin-top: 6px; }
      .bulletItem { border-top: 1px solid var(--vscode-editorWidget-border); padding-top: 8px; margin-top: 8px; }
      .suiteCasesFilter {
        display: grid;
        grid-template-columns: 150px 1fr;
        gap: 8px;
        margin-top: 8px;
      }
      .suiteCaseLine { display: grid; grid-template-columns: 180px 1fr 90px auto; gap: 8px; align-items: center; border-top: 1px solid var(--vscode-editorWidget-border); padding-top: 6px; margin-top: 6px; }
      .linkLike { background: transparent; color: var(--vscode-textLink-foreground); border: none; padding: 0; text-align: left; cursor: pointer; }
      .chartWrap { border: 1px solid var(--vscode-editorWidget-border); border-radius: 8px; padding: 8px; background: var(--vscode-editorWidget-background); margin-top: 0; margin-bottom: 10px; }
      .chartLegend { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; font-size: 11px; color: var(--vscode-descriptionForeground); }
      .legendDot { width: 10px; height: 10px; display: inline-block; border-radius: 2px; margin-right: 4px; }
      .chartNote { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
    </style>
  </head>
  <body>
    <div class="topBar">
      <div id="context" class="context"></div>
      <div id="saveState" class="saveState" aria-live="polite"></div>
    </div>
    <section class="panel">
      <div id="detail"></div>
    </section>
    <script>
      const vscode = acquireVsCodeApi();
      const detailEl = document.getElementById('detail');
      const contextEl = document.getElementById('context');
      const saveStateEl = document.getElementById('saveState');
      let snapshot = { root: '', suites: [], cases: [], selectedSuite: null, selectedCase: null, suiteCases: [], relatedOptions: [], relatedRefById: {} };
      let suppressSnapshotUntil = 0;
      let pendingSnapshot = null;
      let pendingSnapshotTimer = null;
      let saveStateTimer = null;
      function esc(v){ return (v || '').replace(/"/g, '&quot;'); }
      function setSaveState(kind, text) {
        saveStateEl.className = 'saveState ' + (kind || '');
        saveStateEl.textContent = text || '';
      }
      function fileIcon() {
        return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 1.5h6.8L13 4.7V14.5H3z" stroke="currentColor" stroke-width="1.2"/><path d="M9.8 1.5v3.2H13" stroke="currentColor" stroke-width="1.2"/></svg>';
      }
      function schedulePendingSnapshotApply() {
        if (pendingSnapshotTimer) {
          clearTimeout(pendingSnapshotTimer);
        }
        const wait = Math.max(0, suppressSnapshotUntil - Date.now()) + 60;
        pendingSnapshotTimer = setTimeout(() => {
          if (!pendingSnapshot) {
            return;
          }
          snapshot = pendingSnapshot;
          pendingSnapshot = null;
          render();
        }, wait);
      }
      function bindAutoPersist(card, buildMessage) {
        let lastSent = JSON.stringify(buildMessage());
        let debounceTimer = null;
        const markEditing = () => {
          suppressSnapshotUntil = Date.now() + 1200;
        };
        const flush = () => {
          if (!document.body.contains(card)) {
            return;
          }
          const next = buildMessage();
          const serialized = JSON.stringify(next);
          if (serialized === lastSent) {
            return;
          }
          lastSent = serialized;
          setSaveState('saving', 'Saving...');
          vscode.postMessage(next);
          if (saveStateTimer) {
            clearTimeout(saveStateTimer);
          }
          saveStateTimer = setTimeout(() => setSaveState('saved', 'Saved'), 180);
        };
        const schedule = () => {
          if (debounceTimer) {
            clearTimeout(debounceTimer);
          }
          debounceTimer = setTimeout(flush, 700);
        };

        card.addEventListener('input', () => {
          markEditing();
          schedule();
        });
        card.addEventListener('change', () => {
          markEditing();
          schedule();
        });
        card.addEventListener('click', (event) => {
          const target = event.target;
          if (target && target.closest && target.closest('button')) {
            markEditing();
            schedule();
          }
        });
      }
      function createChipEditor(root, initialValues, options = {}) {
        let values = [...(initialValues || [])];
        const chips = root.querySelector('[data-role="chips"]');
        const input = root.querySelector('[data-role="chipInput"]');
        const onChipClick = options.onChipClick || null;
        const removable = options.removable !== false;
        const readOnly = options.readOnly === true;
        const render = () => {
          chips.innerHTML = '';
          for (const value of values) {
            const el = document.createElement('span');
            el.className = 'chip';
            if (onChipClick) {
              el.innerHTML = '<button type="button" class="chipLink" data-role="chipLink">' + esc(value) + '</button>' + (removable ? '<button type="button" data-role="remove">x</button>' : '');
              el.querySelector('[data-role="chipLink"]').addEventListener('click', () => onChipClick(value));
            } else {
              el.innerHTML = '<span>' + esc(value) + '</span>' + (removable ? '<button type="button" data-role="remove">x</button>' : '');
            }
            if (removable) {
              el.querySelector('[data-role="remove"]').addEventListener('click', () => {
                values = values.filter((v) => v !== value);
                render();
              });
            }
            chips.appendChild(el);
          }
          if (!readOnly) {
            chips.appendChild(input);
          }
        };
        if (readOnly) {
          render();
          return { getValues: () => values.slice() };
        }
        const pushInput = (keepFocus = false) => {
          const raw = input.value.trim();
          if (!raw) return;
          const next = raw.split(',').map((v) => v.trim()).filter((v) => v.length > 0);
          values = Array.from(new Set(values.concat(next)));
          input.value = '';
          render();
          if (keepFocus) {
            input.focus();
          }
        };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            pushInput(true);
          }
        });
        input.addEventListener('blur', () => pushInput());
        render();
        return { getValues: () => values.slice() };
      }
      function createTextListEditor(root, values, addLabel, options = {}) {
        const list = root.querySelector('[data-role="list"]');
        const useTextarea = options.multiline === true;
        const add = (value = '') => {
          const row = document.createElement('div');
          row.className = 'listRow';
          row.setAttribute('data-role', 'list-row');
          const inputHtml = useTextarea
            ? '<textarea data-role="value" rows="2">' + esc(value) + '</textarea>'
            : '<input data-role="value" value="' + esc(value) + '" />';
          row.innerHTML =
            '<span class="muted">・</span>' +
            inputHtml +
            '<button class="secondary" type="button" data-role="remove">Remove</button>';
          row.querySelector('[data-role="remove"]').addEventListener('click', () => row.remove());
          list.appendChild(row);
        };
        for (const v of values || []) {
          add(v);
        }
        root.querySelector('[data-role="add"]').textContent = addLabel;
        root.querySelector('[data-role="add"]').addEventListener('click', () => add(''));
        return {
          values: () =>
            Array.from(list.querySelectorAll('[data-role="value"]'))
              .map((el) => el.value.trim())
              .filter((v) => v.length > 0)
        };
      }
      function toRelatedRefs(values) {
        return (values || []).map((value) => snapshot.relatedRefById?.[value] || value);
      }
      function resolveRelatedOption(value) {
        const text = (value || '').trim();
        if (!text) {
          return null;
        }
        return (snapshot.relatedOptions || []).find((option) => option.ref === text || option.id === text) || null;
      }
      function createRelatedEditor(root, initialValues, relatedOptions, selfId) {
        const listId = 'related-list-' + Math.random().toString(36).slice(2);
        root.innerHTML =
          '<div class="muted" style="margin-bottom:4px;">Use IDs like <code>suite.case</code>. Press Enter or comma to add.</div>' +
          '<div data-role="editor" class="chips"><div data-role="chips"></div><input data-role="chipInput" class="chipInput" placeholder="type related id" list="' + listId + '" /></div>' +
          '<datalist id="' + listId + '"></datalist>';
        const dataList = root.querySelector('datalist');
        for (const option of relatedOptions || []) {
          if (!option || option.ref === selfId || option.id === selfId) {
            continue;
          }
          const item = document.createElement('option');
          item.value = option.ref || option.id;
          item.label = option.label || option.ref || option.id;
          dataList.appendChild(item);
        }
        return createChipEditor(root.querySelector('[data-role="editor"]'), initialValues || [], {
          onChipClick: (value) => {
            const target = resolveRelatedOption(value);
            if (!target || !target.path) {
              return;
            }
            vscode.postMessage({ type: 'jumpToPath', path: target.path, entityType: target.entityType || undefined });
          }
        });
      }
      function createSuiteCard(suite) {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML =
          '<div class="head"><div><strong>' + suite.id + '</strong> <span class="muted">' + suite.path + '</span></div><button class="iconBtn" data-role="openRaw" title="Open YAML" aria-label="Open YAML">' + fileIcon() + '</button></div>' +
          '<div class="muted" style="margin-top:6px;">Root / ' + esc(suite.id) + '</div>' +
          '<div class="overviewRows">' +
            '<div class="overviewRow">' +
              '<div class="stack"><label>id</label><input value="' + esc(suite.id) + '" readonly /></div>' +
              '<div class="stack"><label>title</label><input data-role="title" value="' + esc(suite.title) + '" /></div>' +
            '</div>' +
            '<div class="overviewRow meta">' +
              '<div class="stack inlineCheckbox"><label>scoped</label><label><input data-role="scoped" type="checkbox" aria-label="scoped" ' + (suite.scoped ? 'checked' : '') + ' /></label></div>' +
              '<div class="stack"><label>tags</label><div data-role="tagsEditor" class="chips"><div data-role="chips"></div><input data-role="chipInput" class="chipInput" placeholder="comma or enter" /></div></div>' +
              '<div class="stack"><label>owners</label><div data-role="ownersEditor" class="chips"><div data-role="chips"></div><input data-role="chipInput" class="chipInput" placeholder="comma or enter" /></div></div>' +
            '</div>' +
          '</div>' +
          '<div class="field"><label>related</label><div data-role="relatedEditor"></div></div>' +
          '<div class="field"><label>scheduled</label><div class="rangeLine"><input data-role="scheduledStart" type="date" lang="en" value="' + esc(suite.duration?.scheduled?.start || '') + '" /><span>-</span><input data-role="scheduledEnd" type="date" lang="en" value="' + esc(suite.duration?.scheduled?.end || '') + '" /></div></div>' +
          '<div class="field"><label>actual</label><div class="rangeLine"><input data-role="actualStart" type="date" lang="en" value="' + esc(suite.duration?.actual?.start || '') + '" /><span>-</span><input data-role="actualEnd" type="date" lang="en" value="' + esc(suite.duration?.actual?.end || '') + '" /></div></div>' +
          '<div class="field"><label>description</label><textarea data-role="description" rows="2">' + esc(suite.description || '') + '</textarea></div>' +
          '<div class="field"><label>remarks</label><div><div data-role="suiteRemarksEditor"><div data-role="list"></div><button class="secondary" data-role="add" type="button"></button></div></div></div>';
        const tagsEditor = createChipEditor(card.querySelector('[data-role="tagsEditor"]'), suite.tags || []);
        const ownersEditor = createChipEditor(card.querySelector('[data-role="ownersEditor"]'), suite.owners || []);
        const relatedEditor = createRelatedEditor(
          card.querySelector('[data-role="relatedEditor"]'),
          toRelatedRefs(suite.related || []),
          snapshot.relatedOptions || [],
          suite.id
        );
        const remarksEditor = createTextListEditor(card.querySelector('[data-role="suiteRemarksEditor"]'), suite.remarks || [], 'Add Remark', { multiline: true });
        card.querySelector('[data-role="openRaw"]').addEventListener('click', () => vscode.postMessage({ type: 'openRaw', path: suite.path }));
        bindAutoPersist(card, () => ({
            type: 'saveSuite',
            path: suite.path,
            id: suite.id,
            title: card.querySelector('[data-role="title"]').value,
            description: card.querySelector('[data-role="description"]').value,
            tags: tagsEditor.getValues().join(','),
            owners: ownersEditor.getValues().join(','),
            scoped: card.querySelector('[data-role="scoped"]').checked,
            scheduledStart: card.querySelector('[data-role="scheduledStart"]').value,
            scheduledEnd: card.querySelector('[data-role="scheduledEnd"]').value,
            actualStart: card.querySelector('[data-role="actualStart"]').value,
            actualEnd: card.querySelector('[data-role="actualEnd"]').value,
            related: relatedEditor.getValues().join(','),
            remarks: remarksEditor.values().join('\\n')
          }));
        return card;
      }
      function parseDateOnly(text) {
        if (!text || typeof text !== 'string') return null;
        const trimmed = text.trim();
        if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(trimmed)) return null;
        return new Date(trimmed + 'T00:00:00');
      }
      function formatDateKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
      }
      function eachDay(start, end) {
        const days = [];
        const current = new Date(start.getTime());
        while (current <= end) {
          days.push(new Date(current.getTime()));
          current.setDate(current.getDate() + 1);
        }
        return days;
      }
      function createSuiteBurndownChart(suite, cases) {
        const scheduledStart = parseDateOnly(suite?.duration?.scheduled?.start || '');
        const scheduledEnd = parseDateOnly(suite?.duration?.scheduled?.end || '');
        const box = document.createElement('div');
        box.className = 'chartWrap';
        if (!scheduledStart || !scheduledEnd || scheduledStart > scheduledEnd) {
          box.innerHTML = '<div class="muted">Burndown: set valid duration.scheduled.start/end to render chart.</div>';
          return box;
        }

        const scopedCases = suite?.scoped ? (cases || []).filter((testCase) => testCase?.scoped === true) : [];
        const dates = eachDay(scheduledStart, scheduledEnd);
        const totalCases = scopedCases.length;
        const xStep = dates.length > 1 ? 760 / (dates.length - 1) : 0;
        const yMaxLeft = Math.max(totalCases, 1);

        const dayKeySet = new Set(dates.map((d) => formatDateKey(d)));
        const doneByDay = new Map();
        const issueDetectedByDay = new Map();
        const issueClosedByDay = new Map();

        for (const testCase of scopedCases) {
          const completed = parseDateOnly(testCase.completedDay || '');
          if (completed && dayKeySet.has(formatDateKey(completed)) && testCase.status === 'done') {
            const key = formatDateKey(completed);
            doneByDay.set(key, (doneByDay.get(key) || 0) + 1);
          }
          for (const issue of testCase.issues || []) {
            const detected = parseDateOnly(issue.detectedDay || '');
            if (detected && dayKeySet.has(formatDateKey(detected))) {
              const key = formatDateKey(detected);
              issueDetectedByDay.set(key, (issueDetectedByDay.get(key) || 0) + 1);
            }
            const closed = parseDateOnly(issue.completedDay || '');
            if (closed && dayKeySet.has(formatDateKey(closed))) {
              const key = formatDateKey(closed);
              issueClosedByDay.set(key, (issueClosedByDay.get(key) || 0) + 1);
            }
          }
        }

        const issueDetectedMax = Math.max(0, ...Array.from(issueDetectedByDay.values()));
        let issueDetectedCumulativeMax = 0;
        let issueDetectedAccForScale = 0;
        let issueClosedAccForScale = 0;
        let issueRemainingMax = 0;
        for (const d of dates) {
          const key = formatDateKey(d);
          issueDetectedAccForScale += issueDetectedByDay.get(key) || 0;
          issueClosedAccForScale += issueClosedByDay.get(key) || 0;
          issueDetectedCumulativeMax = Math.max(issueDetectedCumulativeMax, issueDetectedAccForScale);
          issueRemainingMax = Math.max(issueRemainingMax, Math.max(0, issueDetectedAccForScale - issueClosedAccForScale));
        }
        const issueScaleMax = Math.max(yMaxLeft, issueDetectedMax, issueDetectedCumulativeMax, issueRemainingMax, 1);
        const detectedBarColor = 'var(--vscode-descriptionForeground)';

        let doneAcc = 0;
        let detectedAcc = 0;
        let closedAcc = 0;
        const idealPoints = [];
        const actualPoints = [];
        const remainingIssuePoints = [];
        const bars = [];
        const xTicks = [];
        const xGrid = [];
        const yTicks = [];

        const calcAxisStep = (maxValue, targetTicks) => {
          if (maxValue <= 0) {
            return 1;
          }
          return Math.max(1, Math.ceil(maxValue / targetTicks));
        };
        const yTickStep = calcAxisStep(totalCases, 6);
        const xTickStep = calcAxisStep(Math.max(dates.length - 1, 1), 8);
        const yValues = [];
        for (let value = 0; value <= totalCases; value += yTickStep) {
          yValues.push(value);
        }
        if (yValues.length === 0 || yValues[yValues.length - 1] !== totalCases) {
          yValues.push(totalCases);
        }
        yValues.sort((a, b) => b - a);
        for (const value of yValues) {
          const y = 20 + 180 * (1 - value / yMaxLeft);
          yTicks.push('<line x1="30" y1="' + y.toFixed(2) + '" x2="790" y2="' + y.toFixed(2) + '" stroke="var(--vscode-editorWidget-border)" stroke-opacity="0.5" />');
          yTicks.push('<text x="24" y="' + (y + 3).toFixed(2) + '" text-anchor="end" font-size="10" fill="var(--vscode-descriptionForeground)">' + String(value) + '</text>');
        }

        for (let i = 0; i < dates.length; i += 1) {
          const d = dates[i];
          const key = formatDateKey(d);
          const x = 30 + xStep * i;
          const idealRemaining = Math.max(0, totalCases - (totalCases * i) / Math.max(dates.length - 1, 1));
          const doneToday = doneByDay.get(key) || 0;
          doneAcc += doneToday;
          const actualRemaining = Math.max(0, totalCases - doneAcc);
          const detectedToday = issueDetectedByDay.get(key) || 0;
          const closedToday = issueClosedByDay.get(key) || 0;
          detectedAcc += detectedToday;
          closedAcc += closedToday;
          const remainingIssues = Math.max(0, detectedAcc - closedAcc);

          // Burndown: start from total cases and move downward as remaining decreases.
          const yIdeal = 20 + 180 * (1 - idealRemaining / yMaxLeft);
          const yActual = 20 + 180 * (1 - actualRemaining / yMaxLeft);
          const yRemainIssue = 20 + 180 - (180 * remainingIssues) / issueScaleMax;
          idealPoints.push(x.toFixed(2) + ',' + yIdeal.toFixed(2));
          actualPoints.push(x.toFixed(2) + ',' + yActual.toFixed(2));
          remainingIssuePoints.push(x.toFixed(2) + ',' + yRemainIssue.toFixed(2));

          const barWidth = Math.max(2, Math.min(14, xStep * 0.65 || 10));
          // Detected Issues should accumulate over time (cumulative stacked style by day).
          if (detectedAcc > 0) {
            const h = (180 * detectedAcc) / issueScaleMax;
            const yTop = 200 - h;
            bars.push('<rect x="' + (x - barWidth / 2).toFixed(2) + '" y="' + yTop.toFixed(2) + '" width="' + barWidth.toFixed(2) + '" height="' + h.toFixed(2) + '" fill="' + detectedBarColor + '" />');
          }
          if (i % xTickStep === 0 || i === dates.length - 1) {
            xGrid.push('<line x1="' + x.toFixed(2) + '" y1="20" x2="' + x.toFixed(2) + '" y2="200" stroke="var(--vscode-editorWidget-border)" stroke-opacity="0.35" />');
            xTicks.push('<text x="' + x.toFixed(2) + '" y="218" text-anchor="middle" font-size="10" fill="var(--vscode-descriptionForeground)">' + key.slice(5) + '</text>');
          }
        }

        box.innerHTML =
          '<div><strong>Suite Burndown</strong></div>' +
          '<svg viewBox="0 0 820 230" width="100%" height="230" role="img" aria-label="Suite burndown chart">' +
            yTicks.join('') +
            xGrid.join('') +
            '<line x1="30" y1="20" x2="30" y2="200" stroke="var(--vscode-input-border)" />' +
            '<line x1="30" y1="200" x2="790" y2="200" stroke="var(--vscode-input-border)" />' +
            bars.join('') +
            '<polyline fill="none" stroke="var(--vscode-foreground)" stroke-width="2" points="' + idealPoints.join(' ') + '" />' +
            '<polyline fill="none" stroke="var(--vscode-textLink-foreground)" stroke-width="2" points="' + actualPoints.join(' ') + '" />' +
            '<polyline fill="none" stroke="var(--vscode-symbolIcon-variableForeground)" stroke-width="2" points="' + remainingIssuePoints.join(' ') + '" />' +
            xTicks.join('') +
            '<text x="14" y="18" text-anchor="start" font-size="10" fill="var(--vscode-descriptionForeground)">Cases</text>' +
          '</svg>' +
          '<div class="chartLegend">' +
            '<span><i class="legendDot" style="background:var(--vscode-foreground)"></i>Ideal Remaining</span>' +
            '<span><i class="legendDot" style="background:var(--vscode-textLink-foreground)"></i>Actual Remaining</span>' +
            '<span><i class="legendDot" style="background:var(--vscode-descriptionForeground)"></i>Detected Issues cumulative (bar)</span>' +
            '<span><i class="legendDot" style="background:var(--vscode-symbolIcon-variableForeground)"></i>Remaining Issues/day</span>' +
          '</div>' +
          '<div class="chartNote">Scope rule: only Suite scoped=true and Case scoped=true are counted. Detected issues bars are cumulative by detectedDay. Remaining issues uses cumulative detected minus cumulative completedDay.</div>';
        return box;
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
            '<div class="field"><label>name</label><input data-key="name" value="' + esc(item.name || '') + '" /></div>' +
            '<div class="field"><label>expected</label><textarea data-key="expected" rows="2">' + esc(item.expected || '') + '</textarea></div>' +
            '<div class="field"><label>actual</label><textarea data-key="actual" rows="2">' + esc(item.actual || '') + '</textarea></div>' +
            '<div class="field"><label>trails</label><div data-key="trailsEditor"><div data-role="list"></div><button class="secondary" data-role="add" type="button"></button></div></div>' +
            '<div class="field"><label>status</label><select data-key="status">' +
              '<option value="" ' + (status === '' ? 'selected' : '') + '>null</option>' +
              '<option value="pass" ' + (status === 'pass' ? 'selected' : '') + '>pass</option>' +
              '<option value="fail" ' + (status === 'fail' ? 'selected' : '') + '>fail</option>' +
              '<option value="skip" ' + (status === 'skip' ? 'selected' : '') + '>skip</option>' +
              '<option value="block" ' + (status === 'block' ? 'selected' : '') + '>block</option>' +
            '</select></div>' +
            '<div><button class="secondary" data-role="remove" type="button">Remove Test</button></div>';
          const trailsEditor = createTextListEditor(
            row.querySelector('[data-key="trailsEditor"]'),
            item.trails || [],
            'Add Trail',
            { multiline: true }
          );
          row.trailsEditor = trailsEditor;
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
            trails: row.trailsEditor.values(),
            status: row.querySelector('[data-key="status"]').value || null
          })).filter((t) => t.name.length > 0)
        };
      }
      function createIssuesEditor(root, issues) {
        const list = root.querySelector('[data-role="issuesList"]');
        const add = (issue = { incident: '', owners: [], causes: [], solutions: [], status: 'open', detectedDay: null, completedDay: null, related: [], remarks: [] }) => {
          const row = document.createElement('div');
          row.className = 'bulletItem';
          row.setAttribute('data-role', 'issue-item');
          row.innerHTML =
            '<div class="field"><label>incident</label><input data-key="incident" value="' + esc(issue.incident || '') + '" /></div>' +
            '<div class="field"><label>owners</label><div data-key="ownersEditor" class="chips"><div data-role="chips"></div><input data-role="chipInput" class="chipInput" placeholder="comma or enter" /></div></div>' +
            '<div class="field"><label>causes</label><div data-key="causesEditor"><div data-role="list"></div><button class="secondary" data-role="add" type="button"></button></div></div>' +
            '<div class="field"><label>solutions</label><div data-key="solutionsEditor"><div data-role="list"></div><button class="secondary" data-role="add" type="button"></button></div></div>' +
            '<div class="field"><label>status</label><select data-key="status"><option value="open"' + (issue.status==='open'?' selected':'') + '>open</option><option value="doing"' + (issue.status==='doing'?' selected':'') + '>doing</option><option value="resolved"' + (issue.status==='resolved'?' selected':'') + '>resolved</option><option value="pending"' + (issue.status==='pending'?' selected':'') + '>pending</option></select></div>' +
            '<div class="field"><label>detectedDay</label><input data-key="detectedDay" type="date" lang="en" value="' + esc(issue.detectedDay || '') + '" /></div>' +
            '<div class="field"><label>completedDay</label><input data-key="completedDay" type="date" lang="en" value="' + esc(issue.completedDay || '') + '" /></div>' +
            '<div class="field"><label>related</label><div data-key="relatedEditor"></div></div>' +
            '<div class="field"><label>remarks</label><div data-key="remarksEditor"><div data-role="list"></div><button class="secondary" data-role="add" type="button"></button></div></div>' +
            '<div><button class="secondary" data-role="remove" type="button">Remove Issue</button></div>';
          const ownersEditor = createChipEditor(row.querySelector('[data-key="ownersEditor"]'), issue.owners || []);
          const causesEditor = createTextListEditor(row.querySelector('[data-key="causesEditor"]'), issue.causes || [], 'Add Cause', { multiline: true });
          const solutionsEditor = createTextListEditor(row.querySelector('[data-key="solutionsEditor"]'), issue.solutions || [], 'Add Solution', { multiline: true });
          const relatedEditor = createRelatedEditor(
            row.querySelector('[data-key="relatedEditor"]'),
            toRelatedRefs(issue.related || []),
            snapshot.relatedOptions || [],
            ''
          );
          const remarksEditor = createTextListEditor(
            row.querySelector('[data-key="remarksEditor"]'),
            issue.remarks || [],
            'Add Remark',
            { multiline: true }
          );
          row.ownersEditor = ownersEditor;
          row.causesEditor = causesEditor;
          row.solutionsEditor = solutionsEditor;
          row.relatedEditor = relatedEditor;
          row.remarksEditor = remarksEditor;
          row.querySelector('[data-role="remove"]').addEventListener('click', () => row.remove());
          list.appendChild(row);
        };
        for (const i of issues || []) add(i);
        return {
          add,
          values: () => Array.from(list.querySelectorAll('[data-role="issue-item"]')).map((row) => ({
            incident: row.querySelector('[data-key="incident"]').value.trim(),
            owners: row.ownersEditor.getValues(),
            causes: row.causesEditor.values(),
            solutions: row.solutionsEditor.values(),
            status: row.querySelector('[data-key="status"]').value,
            detectedDay: row.querySelector('[data-key="detectedDay"]').value || null,
            completedDay: row.querySelector('[data-key="completedDay"]').value || null,
            related: row.relatedEditor.getValues(),
            remarks: row.remarksEditor.values()
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
          '<div class="muted" style="margin-top:6px;">Root / ' + esc(testCase.suiteId || '-') + ' / ' + esc(testCase.id) + '</div>' +
          '<div class="overviewRows">' +
            '<div class="overviewRow">' +
              '<div class="stack"><label>id</label><input value="' + esc(testCase.id) + '" readonly /></div>' +
              '<div class="stack"><label>title</label><input data-role="title" value="' + esc(testCase.title) + '" /></div>' +
            '</div>' +
            '<div class="overviewRow meta">' +
              '<div class="stack inlineCheckbox"><label>scoped</label><label><input data-role="scoped" type="checkbox" aria-label="scoped" ' + (testCase.scoped ? 'checked' : '') + ' /></label></div>' +
              '<div class="stack"><label>tags</label><div data-role="tagsEditor" class="chips"><div data-role="chips"></div><input data-role="chipInput" class="chipInput" placeholder="comma or enter" /></div></div>' +
              '<div class="stack"><label>owners</label><div data-role="ownersEditor" class="chips"><div data-role="chips"></div><input data-role="chipInput" class="chipInput" /></div></div>' +
            '</div>' +
          '</div>' +
          '<div class="field"><label>status</label><select data-role="status"><option value="" ' + selectedNull + '>null</option><option value="todo" ' + selectedTodo + '>todo</option><option value="doing" ' + selectedDoing + '>doing</option><option value="done" ' + selectedDone + '>done</option></select></div>' +
          '<div class="field"><label>description</label><textarea data-role="description" rows="3">' + esc(testCase.description || '') + '</textarea></div>' +
          '<div class="field"><label>operations</label><div><div data-role="operationsList"></div><button data-role="addOp" class="secondary" type="button" style="margin-top:6px;">Add Step</button></div></div>' +
          '<div class="field"><label>related</label><div data-role="relatedEditor"></div></div>' +
          '<div class="field"><label>completedDay</label><input data-role="completedDay" type="date" lang="en" value="' + esc(testCase.completedDay || '') + '" /></div>' +
          '<div class="field"><label>remarks</label><div><div data-role="caseRemarksEditor"><div data-role="list"></div><button class="secondary" data-role="add" type="button"></button></div></div></div>' +
          '<div class="field"><label>tests</label><div><div data-role="testsList"></div><button data-role="addTest" class="secondary" type="button" style="margin-top:6px;">Add Test</button></div></div>' +
          '<div class="field"><label>issues</label><div><div data-role="issuesList"></div><button data-role="addIssue" class="secondary" type="button" style="margin-top:6px;">Add Issue</button></div></div>' +
          '';
        const ops = createNumberedList(card.querySelector('[data-role="operationsList"]'), testCase.operations || []);
        const ownersEditor = createChipEditor(card.querySelector('[data-role="ownersEditor"]'), testCase.owners || []);
        const tagsEditor = createChipEditor(card.querySelector('[data-role="tagsEditor"]'), testCase.tags || []);
        card.querySelector('[data-role="addOp"]').addEventListener('click', () => ops.add(''));
        const testsEditor = createTestsEditor(card, testCase.tests || []);
        card.querySelector('[data-role="addTest"]').addEventListener('click', () => testsEditor.add());
        const issuesEditor = createIssuesEditor(card, testCase.issues || []);
        card.querySelector('[data-role="addIssue"]').addEventListener('click', () => issuesEditor.add());
        const relatedEditor = createRelatedEditor(
          card.querySelector('[data-role="relatedEditor"]'),
          toRelatedRefs(testCase.related || []),
          snapshot.relatedOptions || [],
          testCase.id
        );
        const remarksEditor = createTextListEditor(card.querySelector('[data-role="caseRemarksEditor"]'), testCase.remarks || [], 'Add Remark', { multiline: true });
        card.querySelector('[data-role="openRaw"]').addEventListener('click', () => vscode.postMessage({ type: 'openRaw', path: testCase.path }));
        bindAutoPersist(card, () => ({
            type: 'saveCase',
            path: testCase.path,
            id: testCase.id,
            title: card.querySelector('[data-role="title"]').value,
            description: card.querySelector('[data-role="description"]').value,
            tags: tagsEditor.getValues().join(','),
            owners: ownersEditor.getValues().join(','),
            scoped: card.querySelector('[data-role="scoped"]').checked,
            status: card.querySelector('[data-role="status"]').value || null,
            operations: ops.values(),
            related: relatedEditor.getValues().join(','),
            remarks: remarksEditor.values().join('\\n'),
            completedDay: card.querySelector('[data-role="completedDay"]').value,
            tests: testsEditor.values(),
            issues: issuesEditor.values()
          }));
        return card;
      }
      function render() {
        detailEl.innerHTML = '';
        if (!snapshot.selectedSuite && !snapshot.selectedCase) {
          setSaveState('', '');
        }
        if (snapshot.selectedSuite) {
          contextEl.textContent = 'Suite: ' + (snapshot.selectedSuite.id || '');
          detailEl.appendChild(createSuiteBurndownChart(snapshot.selectedSuite, snapshot.suiteCases || []));
          const title = document.createElement('h4');
          title.textContent = 'Suite Editor';
          detailEl.appendChild(title);
          detailEl.appendChild(createSuiteCard(snapshot.selectedSuite));
          const casesTitle = document.createElement('h4');
          casesTitle.style.marginTop = '12px';
          casesTitle.textContent = 'Cases in Suite';
          detailEl.appendChild(casesTitle);
          const filter = document.createElement('div');
          filter.className = 'suiteCasesFilter';
          filter.innerHTML =
            '<select data-role="suiteCasesStatus">' +
              '<option value="all">all status</option>' +
              '<option value="todo">todo</option>' +
              '<option value="doing">doing</option>' +
              '<option value="done">done</option>' +
            '</select>' +
            '<input data-role="suiteCasesSearch" placeholder="search case title" aria-label="Search case title" />';
          detailEl.appendChild(filter);
          const listWrap = document.createElement('div');
          detailEl.appendChild(listWrap);
          const renderSuiteCases = () => {
            const statusFilter = filter.querySelector('[data-role="suiteCasesStatus"]').value;
            const text = filter.querySelector('[data-role="suiteCasesSearch"]').value.trim().toLowerCase();
            listWrap.innerHTML = '';
            const filtered = (snapshot.suiteCases || []).filter((testCase) => {
              const statusMatch = statusFilter === 'all' || (testCase.status || 'null') === statusFilter;
              const textMatch = text.length === 0 || (testCase.title || '').toLowerCase().includes(text);
              return statusMatch && textMatch;
            });
            for (const testCase of filtered) {
              const line = document.createElement('div');
              line.className = 'suiteCaseLine';
              line.innerHTML = '<button class="linkLike" data-role="openCase">' + esc(testCase.id) + '</button><span>' + esc(testCase.title || '') + '</span><span class="muted">' + esc(testCase.status || 'null') + '</span><button class="iconBtn" data-role="openCaseRaw" title="Open YAML" aria-label="Open YAML">' + fileIcon() + '</button>';
              line.querySelector('[data-role="openCase"]').addEventListener('click', () => vscode.postMessage({ type: 'jumpToCase', path: testCase.path }));
              line.querySelector('[data-role="openCaseRaw"]').addEventListener('click', () => vscode.postMessage({ type: 'openRaw', path: testCase.path }));
              listWrap.appendChild(line);
            }
          };
          filter.querySelector('[data-role="suiteCasesStatus"]').addEventListener('change', renderSuiteCases);
          filter.querySelector('[data-role="suiteCasesSearch"]').addEventListener('input', renderSuiteCases);
          renderSuiteCases();
          return;
        }
        if (snapshot.selectedCase) {
          contextEl.textContent = 'Case: ' + (snapshot.selectedCase.id || '');
          const title = document.createElement('h4');
          title.textContent = 'Case Editor';
          detailEl.appendChild(title);
          detailEl.appendChild(createCaseCard(snapshot.selectedCase));
          return;
        }
        contextEl.textContent = '';
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = 'Select a suite or case from the tree to edit.';
        detailEl.appendChild(empty);
      }
      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'snapshot') {
          if (Date.now() < suppressSnapshotUntil) {
            pendingSnapshot = msg.payload;
            schedulePendingSnapshotApply();
            return;
          }
          snapshot = msg.payload;
          render();
        }
        if (msg.type === 'error') {
          setSaveState('error', 'Save failed');
          const errorEl = document.createElement('div');
          errorEl.className = 'muted';
          errorEl.textContent = 'Error: ' + msg.message;
          detailEl.prepend(errorEl);
        }
      });
      vscode.postMessage({ type: 'ready' });
    </script>
  </body>
</html>`;
}
