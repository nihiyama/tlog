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
  expandTestcaseCore,
  initTestsDirectoryCore,
  listCasesCore,
  listSuitesCore,
  listTemplatesCore,
  organizeExecutionTargetsCore,
  resolveEntityPathByIdCore,
  validateTestsDirectoryCore
} from "./core-tools.js";
import { normalizeCaseCandidate, normalizeSuiteCandidate } from "./normalization.js";
import { hasStdioFlag, main, startMcpServerStdio } from "./runtime.js";
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
  createSuiteFileCore,
  createSuiteFromPromptCore,
  createTemplateDirectoryCore,
  createTestcaseFromPromptCore,
  expandTestcaseCore,
  hasStdioFlag,
  initTestsDirectoryCore,
  listCasesCore,
  listSuitesCore,
  listTemplatesCore,
  main,
  organizeExecutionTargetsCore,
  resolveEntityPathByIdCore,
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
