import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type TestCase, type Suite } from "@tlog/shared";
import {
  createCaseFileCore,
  createSuiteFileCore,
  createSuiteFromPromptCore,
  createTemplateDirectoryCore,
  createTestcaseFromPromptCore,
  expandTestcaseCore,
  initTestsDirectoryCore,
  listCasesCore,
  listSuitesCore,
  listTemplatesCore,
  organizeExecutionTargetsCore,
  resolveEntityPathByIdCore,
  validateTestsDirectoryCore
} from "./core-tools.js";
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./constants.js";
import {
  createCaseFileInputSchema,
  createCaseInputSchema,
  createSuiteFileInputSchema,
  createSuiteInputSchema,
  createTemplateDirectoryInputSchema,
  expandCaseInputSchema,
  initTestsDirectoryInputSchema,
  listCasesInputSchema,
  listSuitesInputSchema,
  listTemplatesInputSchema,
  organizeInputSchema,
  resolveEntityPathByIdInputSchema,
  validateTestsDirectoryInputSchema
} from "./schemas.js";
import { logEvent, toToolError, toToolResult } from "./utils.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION
  });

  server.registerPrompt(
    "tlog_instruction_template",
    {
      title: "tlog instruction template",
      description: "Returns reusable instruction templates for suite/case generation"
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

  server.registerTool(
    "create_suite_from_prompt",
    {
      title: "Create suite from prompt",
      description: "Generate schema-compliant suite YAML from natural language instruction",
      inputSchema: createSuiteInputSchema
    },
    async (args) => {
      try {
        logEvent("info", "tool.request", { tool: "create_suite_from_prompt", args: { write: args.write } });
        const result = await createSuiteFromPromptCore(args);
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
      description: "Generate schema-compliant testcase YAML from natural language instruction",
      inputSchema: createCaseInputSchema
    },
    async (args) => {
      try {
        logEvent("info", "tool.request", { tool: "create_testcase_from_prompt", args: { write: args.write } });
        const result = await createTestcaseFromPromptCore(args);
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
      description: "Expand an existing testcase based on additional instruction",
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
      description: "Reorganize testcase tests[] based on strategy and mode",
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
      description: "Initialize tests directory similar to tlog init",
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
      description: "Create template directory similar to tlog template",
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
      description: "Create suite file with id/title/fields",
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
      description: "Create testcase file with id/title/fields",
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
    "validate_tests_directory",
    {
      title: "Validate tests directory",
      description: "Validate suite/case YAML files in directory",
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
      description: "List available template directories",
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
      description: "List suite entities with id/path",
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
      description: "List testcase entities with id/status/path",
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
      description: "Resolve suite/testcase path by YAML id, independent from filename",
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

  return server;
}
