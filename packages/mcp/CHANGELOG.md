# @tlog/mcp

## 0.1.8

### Patch Changes

- 813761b: Release fixes for owner persistence and MCP runtime compatibility across shared packages.
  - `@tlog/shared`: include schema/domain updates required by the owner persistence and MCP compatibility fixes.
  - `@tlog/cli`: align CLI behavior with the latest shared schema/runtime updates in this release.
  - `vscode-tlog`: fix unreliable persistence of `owners` values when editing test data (suite-level owners, case-level owners, and issue-level owners).
  - `@tlog/mcp`: fix runtime failure after global install (`npm install -g @tlog/mcp`) where MCP clients can list prompts/resources but fail on `listTools` with `Cannot read properties of undefined (reading '_zod')`.

- Updated dependencies [813761b]
  - @tlog/shared@0.1.1

## 0.1.7

### Patch Changes

- 1e2fa6a: Release MCP server package only.

## 0.1.6

### Patch Changes

- f485b65: Release MCP server package only.

## 0.1.5

### Patch Changes

- e4974e8: Release MCP server package only.

## 0.1.4

### Patch Changes

- 2f1299d: Release CLI, MCP server, and VS Code extension in the next release cycle.
  - `@tlog/cli`: include latest command/docs and workflow updates
  - `@tlog/mcp`: include latest schema/workflow/documentation updates
  - `vscode-tlog` (Marketplace: `nihiyama.vscode-tlog`): publish next extension version

## 0.1.3

### Patch Changes

- 89e6700: Release CLI, MCP server, and VS Code extension in the next release cycle.
  - `@tlog/cli`: include latest command/docs and workflow updates
  - `@tlog/mcp`: include latest schema/workflow/documentation updates
  - `vscode-tlog` (Marketplace: `nihiyama.vscode-tlog`): publish next extension version
