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
      status: z.string().optional()
    })
    .optional()
};

export const resolveEntityPathByIdInputSchema = {
  workspaceRoot: z.string().min(1),
  dir: z.string().min(1),
  id: z.string().min(1)
};
