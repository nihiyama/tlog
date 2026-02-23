import { z } from "zod";

export const createSuiteInputSchema = {
  workspaceRoot: z.string().min(1),
  targetDir: z.string().min(1),
  instruction: z.string().min(1),
  defaults: z.record(z.unknown()).optional(),
  write: z.boolean().default(false)
};

export const createCaseInputSchema = {
  workspaceRoot: z.string().min(1),
  suiteDir: z.string().min(1),
  instruction: z.string().min(1),
  context: z.record(z.unknown()).optional(),
  write: z.boolean().default(false)
};

export const expandCaseInputSchema = {
  workspaceRoot: z.string().min(1),
  testcasePath: z.string().min(1),
  instruction: z.string().min(1),
  preserveFields: z.array(z.string()).default([]),
  write: z.boolean().default(false)
};

export const organizeInputSchema = {
  workspaceRoot: z.string().min(1),
  testcasePath: z.string().optional(),
  testcase: z.record(z.unknown()).optional(),
  strategy: z.enum(["risk-based", "flow-based", "component-based"]).default("flow-based"),
  mode: z.enum(["replace", "append", "auto"]).default("auto"),
  write: z.boolean().default(false)
};

export const initTestsDirectoryInputSchema = {
  workspaceRoot: z.string().min(1),
  outputDir: z.string().optional(),
  templateDir: z.string().nullable().optional(),
  write: z.boolean().default(false)
};

export const createTemplateDirectoryInputSchema = {
  workspaceRoot: z.string().min(1),
  outputDir: z.string().min(1),
  fromDir: z.string().nullable().optional(),
  write: z.boolean().default(false)
};

export const createSuiteFileInputSchema = {
  workspaceRoot: z.string().min(1),
  dir: z.string().min(1),
  id: z.string().min(1),
  title: z.string().min(1),
  fields: z.record(z.unknown()).optional(),
  write: z.boolean().default(false)
};

export const createCaseFileInputSchema = {
  workspaceRoot: z.string().min(1),
  dir: z.string().min(1),
  id: z.string().min(1),
  title: z.string().min(1),
  fields: z.record(z.unknown()).optional(),
  write: z.boolean().default(false)
};

export const validateTestsDirectoryInputSchema = {
  workspaceRoot: z.string().min(1),
  dir: z.string().min(1)
};

export const listTemplatesInputSchema = {
  workspaceRoot: z.string().min(1),
  dir: z.string().min(1)
};

export const listSuitesInputSchema = {
  workspaceRoot: z.string().min(1),
  dir: z.string().min(1),
  filters: z
    .object({
      id: z.string().optional(),
      tag: z.string().optional()
    })
    .optional()
};

export const listCasesInputSchema = {
  workspaceRoot: z.string().min(1),
  dir: z.string().min(1),
  filters: z
    .object({
      id: z.string().optional(),
      status: z.string().optional(),
      tags: z.array(z.string()).optional(),
      owners: z.array(z.string()).optional(),
      scopedOnly: z.boolean().optional(),
      issueHas: z.string().optional(),
      issueStatus: z.string().optional()
    })
    .optional()
};

export const resolveEntityPathByIdInputSchema = {
  workspaceRoot: z.string().min(1),
  dir: z.string().min(1),
  id: z.string().min(1)
};

export const updateSuiteInputSchema = {
  workspaceRoot: z.string().min(1),
  dir: z.string().min(1),
  id: z.string().min(1),
  patch: z.record(z.unknown()),
  write: z.boolean().default(false)
};

export const updateCaseInputSchema = {
  workspaceRoot: z.string().min(1),
  dir: z.string().min(1),
  id: z.string().min(1),
  patch: z.record(z.unknown()),
  write: z.boolean().default(false)
};

export const getTlogSchemaInputSchema = {
  topic: z.enum(["suite", "case", "enum", "issue", "all"]).default("all")
};

export const schemaUsagePromptArgsSchema = {
  useCase: z.enum(["create_suite", "create_case", "update_case"]).default("create_case")
};

export const collectMissingContextInputSchema = {
  operation: z.enum(["create_suite_from_prompt", "create_testcase_from_prompt", "update_suite", "update_case"]),
  draft: z.record(z.unknown()).default({}),
  requestElicitation: z.boolean().default(false)
};

export const resolveRelatedTargetsInputSchema = {
  workspaceRoot: z.string().min(1),
  dir: z.string().min(1),
  sourceId: z.string().min(1),
  relatedIds: z.array(z.string().min(1)).optional()
};

export const syncRelatedInputSchema = {
  workspaceRoot: z.string().min(1),
  dir: z.string().min(1),
  sourceId: z.string().min(1),
  relatedIds: z.array(z.string().min(1)).optional(),
  mode: z.enum(["one-way", "two-way"]).default("two-way"),
  write: z.boolean().default(false)
};

export const getWorkspaceSnapshotInputSchema = {
  workspaceRoot: z.string().min(1),
  dir: z.string().min(1),
  excludeUnscoped: z.boolean().default(false)
};

export const suiteStatsInputSchema = {
  workspaceRoot: z.string().min(1),
  dir: z.string().min(1),
  suiteId: z.string().min(1),
  excludeUnscoped: z.boolean().default(false)
};

export const deleteEntityInputSchema = {
  workspaceRoot: z.string().min(1),
  dir: z.string().min(1),
  id: z.string().min(1),
  dryRun: z.boolean(),
  confirm: z.boolean().optional()
};
