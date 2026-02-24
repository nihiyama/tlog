---
"vscode-tlog": patch
"@tlog/mcp": patch
---

Release fixes for VS Code extension owner persistence and MCP runtime compatibility.

- `vscode-tlog`: fix unreliable persistence of `owners` values when editing test data (suite-level owners, case-level owners, and issue-level owners).
- `@tlog/mcp`: fix runtime failure after global install (`npm install -g @tlog/mcp`) where MCP clients can list prompts/resources but fail on `listTools` with `Cannot read properties of undefined (reading '_zod')`.
