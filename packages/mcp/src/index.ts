import { argv } from "node:process";
import { pathToFileURL } from "node:url";
import { parseYaml } from "@tlog/shared";
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./constants.js";
import {
  createCaseFileCore,
  createSuiteFileCore,
  createSuiteFromPromptCore,
  createTemplateDirectoryCore,
  createTestcaseFromPromptCore,
  deleteCaseCore,
  deleteSuiteCore,
  expandTestcaseCore,
  getWorkspaceSnapshotCore,
  initTestsDirectoryCore,
  listCasesCore,
  listSuitesCore,
  listTemplatesCore,
  organizeExecutionTargetsCore,
  resolveEntityPathByIdCore,
  resolveRelatedTargetsCore,
  suiteStatsCore,
  syncRelatedCore,
  updateCaseCore,
  updateSuiteCore,
  validateTestsDirectoryCore
} from "./core-tools.js";
import { normalizeCaseCandidate, normalizeSuiteCandidate } from "./normalization.js";
import { hasStdioFlag, main, startMcpServerStdio } from "./runtime.js";
import {
  buildMissingContextGuidance,
  buildTlogSchemaExamplesPayload,
  buildTlogSchemaPayload,
  collectMissingContext,
  getSchemaByTopic,
  getSchemaExamplesByTopic,
  getSchemaHints,
  getSchemaUsageTemplate
} from "./schema-contract.js";
import { createMcpServer } from "./server.js";
import {
  asObject,
  extractPromptMetadata,
  findAvailablePath,
  resolvePathInsideWorkspace,
  selectAppliedMode,
  summarizeDiff
} from "./utils.js";

export { MCP_SERVER_NAME, MCP_SERVER_VERSION };
export {
  createCaseFileCore,
  createMcpServer,
  buildMissingContextGuidance,
  buildTlogSchemaExamplesPayload,
  buildTlogSchemaPayload,
  collectMissingContext,
  createSuiteFileCore,
  createSuiteFromPromptCore,
  createTemplateDirectoryCore,
  createTestcaseFromPromptCore,
  deleteCaseCore,
  deleteSuiteCore,
  expandTestcaseCore,
  getWorkspaceSnapshotCore,
  getSchemaByTopic,
  getSchemaExamplesByTopic,
  getSchemaHints,
  getSchemaUsageTemplate,
  hasStdioFlag,
  initTestsDirectoryCore,
  listCasesCore,
  listSuitesCore,
  listTemplatesCore,
  main,
  organizeExecutionTargetsCore,
  resolveEntityPathByIdCore,
  resolveRelatedTargetsCore,
  suiteStatsCore,
  syncRelatedCore,
  updateCaseCore,
  updateSuiteCore,
  startMcpServerStdio,
  validateTestsDirectoryCore
};

export const __internal = {
  asObject,
  extractPromptMetadata,
  resolvePathInsideWorkspace,
  normalizeSuiteCandidate,
  normalizeCaseCandidate,
  summarizeDiff,
  selectAppliedMode,
  findAvailablePath,
  parseYaml
};

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main(argv).catch((error: unknown) => {
    console.error("Failed to start MCP server:", error);
    process.exitCode = 1;
  });
}
