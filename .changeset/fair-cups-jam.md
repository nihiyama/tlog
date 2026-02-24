---
"@tlog/shared": patch
"@tlog/cli": patch
"vscode-tlog": patch
"@tlog/mcp": patch
---

Release fixes for owner persistence and MCP runtime compatibility across shared packages.

- `@tlog/shared`: include schema/domain updates required by the owner persistence and MCP compatibility fixes.
- `@tlog/cli`: align CLI behavior with the latest shared schema/runtime updates in this release.
- `vscode-tlog`: fix unreliable persistence of `owners` values when editing test data (suite-level owners, case-level owners, and issue-level owners).
- `@tlog/mcp`: fix runtime failure after global install (`npm install -g @tlog/mcp`) where MCP clients can list prompts/resources but fail on `listTools` with `Cannot read properties of undefined (reading '_zod')`.
