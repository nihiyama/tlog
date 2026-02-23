import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type TestCase, type Suite } from "@tlog/shared";
import {
  createCaseFileCore,
  createSuiteFileCore,
  createSuiteFromPromptCore,
  createTemplateDirectoryCore,
  createTestcaseFromPromptCore,
  deleteCaseCore,
  deleteSuiteCore,
  expandTestcaseCore,
  initTestsDirectoryCore,
  listCasesCore,
  listSuitesCore,
  listTemplatesCore,
  organizeExecutionTargetsCore,
  resolveEntityPathByIdCore,
  resolveRelatedTargetsCore,
  getWorkspaceSnapshotCore,
  suiteStatsCore,
  syncRelatedCore,
  updateCaseCore,
  updateSuiteCore,
  validateTestsDirectoryCore
} from "./core-tools.js";
import {
  buildMissingContextGuidance,
  buildTlogSchemaExamplesPayload,
  buildTlogSchemaPayload,
  collectMissingContext,
  getSchemaByTopic,
  getSchemaExamplesByTopic,
  getSchemaHints,
  getSchemaUsageTemplate,
  type MissingContextOperation
} from "./schema-contract.js";
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./constants.js";
import {
  collectMissingContextInputSchema,
  createCaseFileInputSchema,
  createCaseInputSchema,
  createSuiteFileInputSchema,
  createSuiteInputSchema,
  createTemplateDirectoryInputSchema,
  deleteEntityInputSchema,
  expandCaseInputSchema,
  getTlogSchemaInputSchema,
  initTestsDirectoryInputSchema,
  listCasesInputSchema,
  listSuitesInputSchema,
  listTemplatesInputSchema,
  organizeInputSchema,
  resolveEntityPathByIdInputSchema,
  resolveRelatedTargetsInputSchema,
  schemaUsagePromptArgsSchema,
  getWorkspaceSnapshotInputSchema,
  syncRelatedInputSchema,
  suiteStatsInputSchema,
  updateCaseInputSchema,
  updateSuiteInputSchema,
  validateTestsDirectoryInputSchema
} from "./schemas.js";
import { logEvent, toToolError, toToolResult } from "./utils.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION
  });

  server.registerResource(
    "tlog_schema",
    "tlog://schema",
    {
      title: "TLog schema",
      description:
        "Canonical schema for TLog entities (suite/case/issue). Read this first to get required fields, enum values, and strict field names before calling create/update tools.",
      mimeType: "application/json"
    },
    async () => {
      const payload = buildTlogSchemaPayload();
      return {
        contents: [
          {
            uri: "tlog://schema",
            text: JSON.stringify(payload, null, 2),
            mimeType: "application/json"
          }
        ]
      };
    }
  );

  server.registerResource(
    "tlog_schema_examples",
    "tlog://schema/examples",
    {
      title: "TLog schema examples",
      description:
        "Minimal and recommended examples for suite/case/issue payloads. Use these examples as concrete input references for create/update operations.",
      mimeType: "application/json"
    },
    async () => {
      const payload = buildTlogSchemaExamplesPayload();
      return {
        contents: [
          {
            uri: "tlog://schema/examples",
            text: JSON.stringify(payload, null, 2),
            mimeType: "application/json"
          }
        ]
      };
    }
  );

  server.registerPrompt(
    "tlog_instruction_template",
    {
      title: "tlog instruction template",
      description:
        "Basic reusable instruction templates for suite/case generation. Prefer tlog_schema_usage_template when you need strict schema-aware guidance."
    },
    async () => {
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: [
                "Suite template: id: <suite-id>; title: <suite title>; include owners/tags/purpose.",
                "Case template: id: <case-id>; title: <case title>; include operations and expected outcomes."
              ].join("\n")
            }
          }
        ]
      };
    }
  );

  server.registerPrompt(
    "tlog_schema_usage_template",
    {
      title: "tlog schema usage template",
      description:
        "Step-by-step guidance for schema-safe calls. Explains pre-check sequence (schema -> examples -> missing context), then create/update call patterns.",
      argsSchema: schemaUsagePromptArgsSchema
    },
    async ({ useCase }) => {
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: getSchemaUsageTemplate(useCase)
            }
          }
        ]
      };
    }
  );

  server.registerTool(
    "get_tlog_schema",
    {
      title: "Get TLog schema",
      description:
        "Returns schema definitions by topic (suite|case|issue|enum|all). Call this before mutation tools to avoid unknown fields or invalid enum values.",
      inputSchema: getTlogSchemaInputSchema
    },
    async (args) => {
      try {
        const result = getSchemaByTopic(args.topic);
        return toToolResult(result);
      } catch (error) {
        return toToolError("failed to get tlog schema", "get_tlog_schema_failed", { cause: String(error) });
      }
    }
  );

  server.registerTool(
    "get_tlog_schema_examples",
    {
      title: "Get TLog schema examples",
      description:
        "Returns minimal/recommended examples by topic. Use when translating natural language requirements into valid structured inputs.",
      inputSchema: getTlogSchemaInputSchema
    },
    async (args) => {
      try {
        const result = getSchemaExamplesByTopic(args.topic);
        return toToolResult(result);
      } catch (error) {
        return toToolError("failed to get tlog schema examples", "get_tlog_schema_examples_failed", {
          cause: String(error)
        });
      }
    }
  );

  server.registerTool(
    "collect_missing_context",
    {
      title: "Collect missing context",
      description:
        "Pre-flight checker for create/update workflows. Returns missingFields/questions/nextAction so the client can ask the user and retry with complete context.",
      inputSchema: collectMissingContextInputSchema
    },
    async (args) => {
      try {
        const result = collectMissingContext(args.operation as MissingContextOperation, args.draft);
        return toToolResult(result);
      } catch (error) {
        return toToolError("failed to collect missing context", "collect_missing_context_failed", {
          cause: String(error)
        });
      }
    }
  );

  server.registerTool(
    "create_suite_from_prompt",
    {
      title: "Create suite from prompt",
      description:
        "Generate a suite from instruction text. Required: workspaceRoot, targetDir, instruction. Set write=false for preview, write=true to persist. Returns schemaHints and may return missing_required_context.",
      inputSchema: createSuiteInputSchema
    },
    async (args) => {
      try {
        const contextCheck = collectMissingContext("create_suite_from_prompt", {
          instruction: args.instruction,
          targetDir: args.targetDir
        });
        if (contextCheck.missingFields.length > 0) {
          return toToolError("missing required context", "missing_required_context", {
            missingFields: contextCheck.missingFields,
            questions: contextCheck.questions,
            nextAction: contextCheck.nextAction,
            guidance: buildMissingContextGuidance("create_suite_from_prompt", {
              workspaceRoot: args.workspaceRoot,
              targetDir: args.targetDir,
              instruction: args.instruction
            })
          });
        }

        logEvent("info", "tool.request", { tool: "create_suite_from_prompt", args: { write: args.write } });
        const result = await createSuiteFromPromptCore(args);
        result.schemaHints = getSchemaHints("suite");
        result.missingFields = [];
        logEvent("info", "tool.response", {
          tool: "create_suite_from_prompt",
          summary: { warnings: (result.warnings as unknown[]).length }
        });
        return toToolResult(result);
      } catch (error) {
        logEvent("error", "tool.error", { tool: "create_suite_from_prompt", error: String(error) });
        return toToolError("failed to create suite", "create_suite_failed", { cause: String(error) });
      }
    }
  );

  server.registerTool(
    "create_testcase_from_prompt",
    {
      title: "Create testcase from prompt",
      description:
        "Generate a testcase from instruction text. Required: workspaceRoot, suiteDir, instruction, and rich context. Primary: context.operations + context.tests[].expected. Fallback: context.expected. Set write=false for preview, write=true to persist.",
      inputSchema: createCaseInputSchema
    },
    async (args) => {
      try {
        const contextCheck = collectMissingContext("create_testcase_from_prompt", {
          instruction: args.instruction,
          suiteDir: args.suiteDir,
          context: args.context
        });
        if (contextCheck.missingFields.length > 0) {
          return toToolError("missing required context", "missing_required_context", {
            missingFields: contextCheck.missingFields,
            questions: contextCheck.questions,
            nextAction: contextCheck.nextAction,
            guidance: buildMissingContextGuidance("create_testcase_from_prompt", {
              workspaceRoot: args.workspaceRoot,
              suiteDir: args.suiteDir,
              instruction: args.instruction,
              context: args.context
            })
          });
        }

        logEvent("info", "tool.request", { tool: "create_testcase_from_prompt", args: { write: args.write } });
        const result = await createTestcaseFromPromptCore(args);
        result.schemaHints = getSchemaHints("case");
        result.missingFields = [];
        logEvent("info", "tool.response", {
          tool: "create_testcase_from_prompt",
          summary: { warnings: (result.warnings as unknown[]).length }
        });
        return toToolResult(result);
      } catch (error) {
        logEvent("error", "tool.error", { tool: "create_testcase_from_prompt", error: String(error) });
        return toToolError("failed to create testcase", "create_testcase_failed", { cause: String(error) });
      }
    }
  );

  server.registerTool(
    "expand_testcase",
    {
      title: "Expand testcase",
      description:
        "Expand an existing testcase file with additional instruction while preserving selected fields. Use write=false to inspect diffSummary before applying changes.",
      inputSchema: expandCaseInputSchema
    },
    async (args) => {
      try {
        const result = await expandTestcaseCore(args);
        return toToolResult(result);
      } catch (error) {
        return toToolError("failed to expand testcase", "expand_testcase_failed", { cause: String(error) });
      }
    }
  );

  server.registerTool(
    "organize_test_execution_targets",
    {
      title: "Organize test execution targets",
      description:
        "Reorganize testcase tests[] with risk/flow/component strategy. mode=auto infers append/replace; set write=true only after reviewing proposedTests.",
      inputSchema: organizeInputSchema
    },
    async (args) => {
      try {
        const result = await organizeExecutionTargetsCore(args);
        return toToolResult(result);
      } catch (error) {
        return toToolError("failed to organize execution targets", "organize_test_execution_targets_failed", {
          cause: String(error)
        });
      }
    }
  );

  server.registerTool(
    "init_tests_directory",
    {
      title: "Initialize tests directory",
      description:
        "Initialize tests directory scaffold. Use write=false to preview plannedFiles, then write=true to create files safely inside workspaceRoot.",
      inputSchema: initTestsDirectoryInputSchema
    },
    async (args) => {
      try {
        const result = await initTestsDirectoryCore(args);
        return toToolResult(result);
      } catch (error) {
        return toToolError("failed to initialize tests directory", "init_tests_directory_failed", {
          cause: String(error)
        });
      }
    }
  );

  server.registerTool(
    "create_template_directory",
    {
      title: "Create template directory",
      description:
        "Create a reusable template directory for suite/case generation. Supports preview via write=false and optional base import via fromDir.",
      inputSchema: createTemplateDirectoryInputSchema
    },
    async (args) => {
      try {
        const result = await createTemplateDirectoryCore(args);
        return toToolResult(result);
      } catch (error) {
        return toToolError("failed to create template directory", "create_template_directory_failed", {
          cause: String(error)
        });
      }
    }
  );

  server.registerTool(
    "create_suite_file",
    {
      title: "Create suite file",
      description:
        "Create a suite YAML file directly from structured fields. id must match ^[A-Za-z0-9_-]+$ and must be unique in dir.",
      inputSchema: createSuiteFileInputSchema
    },
    async (args) => {
      try {
        const result = await createSuiteFileCore({
          workspaceRoot: args.workspaceRoot,
          dir: args.dir,
          id: args.id,
          title: args.title,
          fields: args.fields as Partial<Suite>,
          write: args.write
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError("failed to create suite file", "create_suite_file_failed", { cause: String(error) });
      }
    }
  );

  server.registerTool(
    "create_case_file",
    {
      title: "Create case file",
      description:
        "Create a testcase YAML file directly from structured fields. id must match ^[A-Za-z0-9_-]+$ and must be unique in dir.",
      inputSchema: createCaseFileInputSchema
    },
    async (args) => {
      try {
        const result = await createCaseFileCore({
          workspaceRoot: args.workspaceRoot,
          dir: args.dir,
          id: args.id,
          title: args.title,
          fields: args.fields as Partial<TestCase>,
          write: args.write
        });
        return toToolResult(result);
      } catch (error) {
        return toToolError("failed to create case file", "create_case_file_failed", { cause: String(error) });
      }
    }
  );

  server.registerTool(
    "update_suite",
    {
      title: "Update suite",
      description:
        "Patch a suite by id (id-based resolution, not filename-based). Required: id, patch. Validates with shared schema before write; unknown fields are rejected/normalized.",
      inputSchema: updateSuiteInputSchema
    },
    async (args) => {
      try {
        logEvent("info", "tool.request", {
          tool: "update_suite",
          target: args.id,
          mode: args.write ? "write" : "dry-run"
        });
        const contextCheck = collectMissingContext("update_suite", {
          id: args.id,
          patch: args.patch
        });
        if (contextCheck.missingFields.length > 0) {
          return toToolError("missing required context", "missing_required_context", {
            missingFields: contextCheck.missingFields,
            questions: contextCheck.questions,
            nextAction: contextCheck.nextAction
          });
        }

        const result = await updateSuiteCore({
          workspaceRoot: args.workspaceRoot,
          dir: args.dir,
          id: args.id,
          patch: args.patch as Partial<Suite>,
          write: args.write
        });
        logEvent("info", "tool.response", {
          tool: "update_suite",
          target: args.id,
          mode: args.write ? "write" : "dry-run",
          resultCount: 1,
          errorCode: null
        });
        return toToolResult(result);
      } catch (error) {
        logEvent("error", "tool.error", {
          tool: "update_suite",
          target: args.id,
          mode: args.write ? "write" : "dry-run",
          resultCount: 0,
          errorCode: "update_suite_failed"
        });
        return toToolError("failed to update suite", "update_suite_failed", { cause: String(error) });
      }
    }
  );

  server.registerTool(
    "update_case",
    {
      title: "Update case",
      description:
        "Patch a testcase by id (id-based resolution, not filename-based). Required: id, patch. Validates with shared schema before write; unknown fields are rejected/normalized.",
      inputSchema: updateCaseInputSchema
    },
    async (args) => {
      try {
        logEvent("info", "tool.request", {
          tool: "update_case",
          target: args.id,
          mode: args.write ? "write" : "dry-run"
        });
        const contextCheck = collectMissingContext("update_case", {
          id: args.id,
          patch: args.patch
        });
        if (contextCheck.missingFields.length > 0) {
          return toToolError("missing required context", "missing_required_context", {
            missingFields: contextCheck.missingFields,
            questions: contextCheck.questions,
            nextAction: contextCheck.nextAction
          });
        }

        const result = await updateCaseCore({
          workspaceRoot: args.workspaceRoot,
          dir: args.dir,
          id: args.id,
          patch: args.patch as Partial<TestCase>,
          write: args.write
        });
        logEvent("info", "tool.response", {
          tool: "update_case",
          target: args.id,
          mode: args.write ? "write" : "dry-run",
          resultCount: 1,
          errorCode: null
        });
        return toToolResult(result);
      } catch (error) {
        logEvent("error", "tool.error", {
          tool: "update_case",
          target: args.id,
          mode: args.write ? "write" : "dry-run",
          resultCount: 0,
          errorCode: "update_case_failed"
        });
        return toToolError("failed to update case", "update_case_failed", { cause: String(error) });
      }
    }
  );

  server.registerTool(
    "validate_tests_directory",
    {
      title: "Validate tests directory",
      description:
        "Validate all suite/case YAML files under dir and return structured diagnostics. Use after write=true operations for safe automation pipelines.",
      inputSchema: validateTestsDirectoryInputSchema
    },
    async (args) => {
      try {
        const result = await validateTestsDirectoryCore(args);
        return toToolResult(result);
      } catch (error) {
        return toToolError("failed to validate tests directory", "validate_tests_directory_failed", {
          cause: String(error)
        });
      }
    }
  );

  server.registerTool(
    "list_templates",
    {
      title: "List templates",
      description: "List template directories (folders containing index.yaml) under the specified dir.",
      inputSchema: listTemplatesInputSchema
    },
    async (args) => {
      try {
        const result = await listTemplatesCore(args);
        return toToolResult(result);
      } catch (error) {
        return toToolError("failed to list templates", "list_templates_failed", { cause: String(error) });
      }
    }
  );

  server.registerTool(
    "list_suites",
    {
      title: "List suites",
      description: "List suites with id/path and optional filters (id/tag).",
      inputSchema: listSuitesInputSchema
    },
    async (args) => {
      try {
        const result = await listSuitesCore(args);
        return toToolResult(result);
      } catch (error) {
        return toToolError("failed to list suites", "list_suites_failed", { cause: String(error) });
      }
    }
  );

  server.registerTool(
    "list_cases",
    {
      title: "List cases",
      description:
        "List testcases with id/status/path. Supports filters: id, status, tags, owners(issue owners), scopedOnly, issueHas(keyword), issueStatus.",
      inputSchema: listCasesInputSchema
    },
    async (args) => {
      try {
        const result = await listCasesCore(args);
        return toToolResult(result);
      } catch (error) {
        return toToolError("failed to list cases", "list_cases_failed", { cause: String(error) });
      }
    }
  );

  server.registerTool(
    "resolve_entity_path_by_id",
    {
      title: "Resolve entity path by id",
      description:
        "Resolve entity path by YAML id, independent from filename. Use this when files were renamed manually but ids stayed stable.",
      inputSchema: resolveEntityPathByIdInputSchema
    },
    async (args) => {
      try {
        const result = await resolveEntityPathByIdCore(args);
        return toToolResult(result);
      } catch (error) {
        return toToolError("failed to resolve entity path", "resolve_entity_path_by_id_failed", {
          cause: String(error)
        });
      }
    }
  );

  server.registerTool(
    "resolve_related_targets",
    {
      title: "Resolve related targets",
      description:
        "Resolve related ids from source entity (or provided relatedIds). Returns resolved targets and unresolved ids as warnings.",
      inputSchema: resolveRelatedTargetsInputSchema
    },
    async (args) => {
      try {
        const result = await resolveRelatedTargetsCore(args);
        return toToolResult(result);
      } catch (error) {
        return toToolError("failed to resolve related targets", "resolve_related_targets_failed", {
          cause: String(error)
        });
      }
    }
  );

  server.registerTool(
    "sync_related",
    {
      title: "Sync related",
      description:
        "Synchronize related references. mode=one-way updates only source; mode=two-way also adds reciprocal links on targets. Use write=false first to review changed.",
      inputSchema: syncRelatedInputSchema
    },
    async (args) => {
      try {
        const result = await syncRelatedCore(args);
        return toToolResult(result);
      } catch (error) {
        return toToolError("failed to sync related", "sync_related_failed", {
          cause: String(error)
        });
      }
    }
  );

  server.registerTool(
    "get_workspace_snapshot",
    {
      title: "Get workspace snapshot",
      description:
        "Return workspace-level suite/case snapshot (lightweight cards) for planning and context compression before detailed tool calls.",
      inputSchema: getWorkspaceSnapshotInputSchema
    },
    async (args) => {
      try {
        const result = await getWorkspaceSnapshotCore(args);
        return toToolResult(result);
      } catch (error) {
        return toToolError("failed to get workspace snapshot", "get_workspace_snapshot_failed", {
          cause: String(error)
        });
      }
    }
  );

  server.registerTool(
    "suite_stats",
    {
      title: "Suite stats",
      description:
        "Return suite progress metrics by suite id: todo/doing/done summary and burndown time series derived from scheduled duration and case completion.",
      inputSchema: suiteStatsInputSchema
    },
    async (args) => {
      try {
        const result = await suiteStatsCore(args);
        return toToolResult(result);
      } catch (error) {
        return toToolError("failed to compute suite stats", "suite_stats_failed", {
          cause: String(error)
        });
      }
    }
  );

  server.registerTool(
    "delete_suite",
    {
      title: "Delete suite",
      description:
        "Delete suite by id with safety contract. dryRun=true returns deletion plan and impact only. Execution requires dryRun=false and confirm=true.",
      inputSchema: deleteEntityInputSchema
    },
    async (args) => {
      try {
        logEvent("info", "tool.request", {
          tool: "delete_suite",
          target: args.id,
          mode: args.dryRun ? "dry-run" : "write"
        });
        const result = await deleteSuiteCore(args);
        logEvent("info", "tool.response", {
          tool: "delete_suite",
          target: args.id,
          mode: args.dryRun ? "dry-run" : "write",
          resultCount: Array.isArray(result.writtenFiles) ? result.writtenFiles.length : 0,
          errorCode: null
        });
        return toToolResult(result);
      } catch (error) {
        logEvent("error", "tool.error", {
          tool: "delete_suite",
          target: args.id,
          mode: args.dryRun ? "dry-run" : "write",
          resultCount: 0,
          errorCode: "delete_suite_failed"
        });
        return toToolError("failed to delete suite", "delete_suite_failed", {
          cause: String(error)
        });
      }
    }
  );

  server.registerTool(
    "delete_case",
    {
      title: "Delete case",
      description:
        "Delete case by id with safety contract. dryRun=true returns deletion plan and impact only. Execution requires dryRun=false and confirm=true.",
      inputSchema: deleteEntityInputSchema
    },
    async (args) => {
      try {
        logEvent("info", "tool.request", {
          tool: "delete_case",
          target: args.id,
          mode: args.dryRun ? "dry-run" : "write"
        });
        const result = await deleteCaseCore(args);
        logEvent("info", "tool.response", {
          tool: "delete_case",
          target: args.id,
          mode: args.dryRun ? "dry-run" : "write",
          resultCount: Array.isArray(result.writtenFiles) ? result.writtenFiles.length : 0,
          errorCode: null
        });
        return toToolResult(result);
      } catch (error) {
        logEvent("error", "tool.error", {
          tool: "delete_case",
          target: args.id,
          mode: args.dryRun ? "dry-run" : "write",
          resultCount: 0,
          errorCode: "delete_case_failed"
        });
        return toToolError("failed to delete case", "delete_case_failed", {
          cause: String(error)
        });
      }
    }
  );

  return server;
}
