# @tlog/shared

## 0.2.0

### Minor Changes

- 6a852c7: Release v0.2.0.

  Highlights:
  - Improved VS Code owners filtering to match suite owners, case owners, and issue owners from the Controls pane.
  - Stabilized case YAML field order so `owners` is written immediately after `tags`.
  - Fixed VSIX packaging flow to build latest extension sources before packaging.
  - Polished suites controls/icons and related UI behavior updates delivered in recent issue fixes.

## 0.1.1

### Patch Changes

- 813761b: Release fixes for owner persistence and MCP runtime compatibility across shared packages.
  - `@tlog/shared`: include schema/domain updates required by the owner persistence and MCP compatibility fixes.
  - `@tlog/cli`: align CLI behavior with the latest shared schema/runtime updates in this release.
  - `vscode-tlog`: fix unreliable persistence of `owners` values when editing test data (suite-level owners, case-level owners, and issue-level owners).
  - `@tlog/mcp`: fix runtime failure after global install (`npm install -g @tlog/mcp`) where MCP clients can list prompts/resources but fail on `listTools` with `Cannot read properties of undefined (reading '_zod')`.
