<div align="center">
    <picture>
        <img alt="logo" src="./assets/logo.svg" width="180">
    </picture>
</div>

**TLog** is a **VS Code extension** for managing test cases in **YAML** and tracking **execution status, progress, and issues** in one place.  
AI assistance is provided via an **MCP server**, enabling test generation and smart maintenance workflows.


## Key Features

- **YAML-first test management**
  - Organize test suites as directories
  - Use `index.yaml` as a suite entry point / table of contents
- **Progress & execution tracking**
  - Statuses like `todo / doing / done / blocked`
  - Execution logs (who/when/result/notes)
- **Issue tracking**
  - Link discovered issues to test cases
  - Severity, owner, due date, notes, etc.
- **AI assistance via MCP server (optional)**
  - Generate new test cases from templates/specs
  - Improve existing cases (add coverage points, fill gaps, normalize wording)
  - Suggest assertions and edge cases

## Quick Start

1. Install **TLog** in Visual Studio Code.
2. Create a `tests/` directory in your workspace.
3. Add `tests/index.yaml` as the suite entry point.
4. Use the **TLog** sidebar to browse cases, update status, and record runs/issues.

## Monorepo Development

```bash
npm install
npm run build
```

### Package Targets

- CLI package: `@tlog/cli`
  - global install image: `npm install -g @tlog/cli`
  - command: `tlog init`
- MCP package: `@tlog/mcp`
  - execution image: `npx @tlog/mcp --stdio`
- Shared package: `@tlog/shared`
  - API contract: `packages/shared/README.md`
- VS Code extension package: `tlog-vscode-extension`

### Development Commands

Common commands (run at repository root):

```bash
npm install
npm run typecheck
npm run build
npm run test
npm run lint
npm run format
```

CLI development (`@tlog/cli`):

```bash
npm run --workspace @tlog/cli typecheck
npm run --workspace @tlog/cli build
npm run --workspace @tlog/cli test
node packages/cli/bin/tlog.js --help
node packages/cli/bin/tlog.js init
```

MCP development (`@tlog/mcp`):

```bash
npm run --workspace @tlog/mcp typecheck
npm run --workspace @tlog/mcp build
npm run --workspace @tlog/mcp test
npx @tlog/mcp --stdio
```

VS Code extension development (`tlog-vscode-extension`):

```bash
npm run --workspace tlog-vscode-extension typecheck
npm run --workspace tlog-vscode-extension build
npm run --workspace tlog-vscode-extension test
npm run --workspace tlog-vscode-extension package:vsix
```

VS Code extension scaffolding with Yeoman (`generator-code`):

```bash
npx --package yo --package generator-code -- yo code
# or
npm run vscode:scaffold
```

VS Code extension commands from repository root:

```bash
npm run vscode:typecheck
npm run vscode:build
npm run vscode:test
npm run vscode:package
npm run vscode:publish
```

Run extension in your local VS Code (development host):

```bash
code /workspaces/tlog/packages/vscode-extension
```

Then in VS Code:

1. Press `F5` and select `Run TLog Extension`
2. A new Extension Development Host window opens
3. Open Command Palette and run `TLog: Hello`

### Release Flow (Changesets)

```bash
npm run changeset
npm run version-packages
npm run release
```

### GitHub Actions

- CI: `.github/workflows/ci.yml`
  - trigger: push (`main`) / pull request
  - run: `npm ci` -> `npm run typecheck` -> `npm run build` -> `npm run test`
- Release: `.github/workflows/release.yml`
  - trigger: push (`main`)
  - behavior:
    - if changeset exists: open/update version PR
    - on merged version PR: publish npm packages
    - if `packages/vscode-extension/package.json` version changed: publish VS Code extension

Required repository secrets for publishing:

- `NPM_TOKEN`: npm automation token with publish permission for `@tlog` scope
- `VSCE_PAT`: Personal Access Token for VS Code Marketplace publishing

For extension release operation:

- `@vscode/vsce` is used by `tlog-vscode-extension` scripts:
  - `package:vsix`
  - `publish:marketplace`

## Example Structure

```text
.
├─ packages/
│  ├─ cli/                # npm: @tlog/cli (global install target)
│  │  ├─ bin/
│  │  ├─ src/
│  │  └─ tests/
│  ├─ mcp/                # npm: @tlog/mcp (npx execution target)
│  │  ├─ src/
│  │  └─ tests/
│  ├─ vscode-extension/   # VS Code extension implementation
│  │  ├─ media/
│  │  ├─ src/
│  │  └─ tests/
│  └─ shared/             # shared TypeScript logic across cli/mcp/extension
│     └─ src/
├─ configs/               # shared config templates (tsconfig/eslint/etc.)
└─ scripts/               # repo utility scripts
```
