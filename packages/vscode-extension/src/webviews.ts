export function controlsHtml(): string {
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

export function managerHtml(): string {
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

