# @tlog/mcp

MCP server for TLog (YAML-first test management).

This server exposes schema-safe tools for creating, updating, validating, and organizing TLog suites/cases from MCP-capable clients.

## Highlights

- Strict schema-first workflows (`suite`, `case`, `issue`) via shared validation.
- Safe write model (`write=false` preview, then `write=true` apply).
- ID-based operations (not filename-dependent).
- Context-guided generation with missing-context feedback.
- End-to-end maintenance tools (list, resolve, sync, stats, validate, delete).

## Installation

## Option 1: Run directly with npx (recommended)

```bash
npx @tlog/mcp --stdio
```

## Option 2: Install globally

```bash
npm install -g @tlog/mcp
tlog-mcp --stdio
```

## Option 3: Build from source (local development)

```bash
npm run --workspace @tlog/mcp typecheck
npm run --workspace @tlog/mcp build
npm run --workspace @tlog/mcp test
node packages/mcp/dist/index.js --stdio
```

## Startup Contract

This server currently supports stdio transport.

```bash
tlog-mcp --stdio
```

If `--stdio` is omitted, startup fails with usage guidance.

## Client Configuration

All client examples below use stdio and pass `--stdio` explicitly.

Important:

- Use an absolute path for local `dist/index.js` execution.
- Tool inputs should include an absolute `workspaceRoot`.

## GitHub Copilot (MCP)

Example MCP server entry:

```json
{
  "mcpServers": {
    "tlog": {
      "command": "npx",
      "args": ["-y", "@tlog/mcp", "--stdio"]
    }
  }
}
```

For local build usage:

```json
{
  "mcpServers": {
    "tlog": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp/dist/index.js", "--stdio"]
    }
  }
}
```

## Claude Code

Example MCP server entry:

```json
{
  "mcpServers": {
    "tlog": {
      "command": "npx",
      "args": ["-y", "@tlog/mcp", "--stdio"]
    }
  }
}
```

Local build variant:

```json
{
  "mcpServers": {
    "tlog": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp/dist/index.js", "--stdio"]
    }
  }
}
```

## Codex

Example MCP server entry:

```json
{
  "mcpServers": {
    "tlog": {
      "command": "npx",
      "args": ["-y", "@tlog/mcp", "--stdio"]
    }
  }
}
```

Local build variant:

```json
{
  "mcpServers": {
    "tlog": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp/dist/index.js", "--stdio"]
    }
  }
}
```

Note: exact config file location/UI differs by client version. Use each client's MCP settings entry point, then apply the same `command`/`args` payload.

## Recommended Agent Call Flow

A robust workflow (inspired by production-grade MCP servers):

1. `get_tlog_schema` (topic: `all` or specific).
2. `get_tlog_schema_examples` for concrete payload patterns.
3. `preflight_tool_input` before mutation (strict schema check).
4. `collect_missing_context` before mutation (context completeness check).
5. Mutation tools with `write=false` first.
6. Apply with `write=true`.
7. `validate_tests_directory` to verify final consistency.

## Feature Overview

## 1) Schema and Guidance Layer

- Canonical schema access and examples.
- Prompt templates for schema-safe usage.
- Missing-context detection and guided follow-up questions.

Resources:

- `tlog_schema` (`tlog://schema`)
- `tlog_schema_examples` (`tlog://schema/examples`)

Prompts:

- `tlog_instruction_template`
- `tlog_schema_usage_template` (`create_suite`, `create_case`, `update_case`)

Tools:

- `get_tlog_schema`
- `get_tlog_schema_examples`
- `preflight_tool_input`
- `collect_missing_context`

## 2) Authoring and Mutation

Generation-oriented:

- `create_suite_from_prompt`
- `create_testcase_from_prompt`
- `expand_testcase`
- `organize_test_execution_targets`

Structured create/update:

- `create_suite_file`
- `create_case_file`
- `update_suite`
- `update_case`

Template/bootstrap:

- `init_tests_directory`
- `create_template_directory`

## 3) Discovery and Operations

- `list_templates`
- `list_suites`
- `list_cases`
- `resolve_entity_path_by_id`
- `resolve_related_targets`
- `sync_related`
- `get_workspace_snapshot`
- `suite_stats`
- `validate_tests_directory`

## 4) Safety-Critical Delete Operations

- `delete_suite`
- `delete_case`

Safety contract:

- `dryRun=true` returns deletion plan and impact.
- Actual deletion requires both:
  - `dryRun=false`
  - `confirm=true`

## Tool Catalog

For quick scanning, here is the complete tool set currently registered by this server:

- `get_tlog_schema`
- `get_tlog_schema_examples`
- `preflight_tool_input`
- `collect_missing_context`
- `create_suite_from_prompt`
- `create_testcase_from_prompt`
- `expand_testcase`
- `organize_test_execution_targets`
- `init_tests_directory`
- `create_template_directory`
- `create_suite_file`
- `create_case_file`
- `update_suite`
- `update_case`
- `validate_tests_directory`
- `list_templates`
- `list_suites`
- `list_cases`
- `resolve_entity_path_by_id`
- `resolve_related_targets`
- `sync_related`
- `get_workspace_snapshot`
- `suite_stats`
- `delete_suite`
- `delete_case`

## Usage Notes for LLM Clients

- Always pass absolute `workspaceRoot`.
- Prefer id-based workflows over filename assumptions.
- Avoid unknown fields in `patch`/create payloads.
- Handle `missing_required_context` responses by asking follow-up questions from returned guidance.
- For `create_testcase_from_prompt`, prioritize `context.tests[].expected`.
- Use `context.expected` only as fallback.

## Error Handling Expectations

- Validation and not-found errors are returned as tool errors with stable error codes.
- Write operations should be treated as two-phase (`preview` then `apply`).
- If path resolution fails, verify `workspaceRoot` and `dir` are absolute/correct.

## Development

```bash
npm run --workspace @tlog/mcp typecheck
npm run --workspace @tlog/mcp test
npm run --workspace @tlog/mcp test:coverage
npm run --workspace @tlog/mcp build
```

## Package

- Name: `@tlog/mcp`
- Bin: `tlog-mcp`
- Transport: stdio (`--stdio`)
