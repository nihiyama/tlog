import { z } from "zod";
import {
  issueStatusSchema,
  suiteSchema,
  testCaseSchema,
  testcaseStatusSchema,
  testResultStatusSchema
} from "@tlog/shared";

const nonEmptyStringSchema = z.string().min(1);
const stringArraySchema = z.array(z.string().min(1));

const suiteFieldsSchema = suiteSchema.omit({ id: true, title: true }).partial().strict();
const caseFieldsSchema = testCaseSchema.omit({ id: true, title: true }).partial().strict();

const suitePatchSchema = suiteSchema.omit({ id: true }).partial().strict();
const casePatchSchema = testCaseSchema.omit({ id: true }).partial().strict();

const caseContextTestSchema = z
  .object({
    name: nonEmptyStringSchema.optional(),
    expected: nonEmptyStringSchema,
    actual: z.string().optional(),
    trails: stringArraySchema.optional(),
    status: testResultStatusSchema.nullable().optional()
  })
  .strict();

const caseContextSchema = z
  .object({
    operations: stringArraySchema.optional(),
    tests: z.array(caseContextTestSchema).optional(),
    expected: z.union([nonEmptyStringSchema, stringArraySchema]).optional(),
    tags: stringArraySchema.optional(),
    description: z.string().optional()
  })
  .strict();

export const createSuiteInputSchema = {
  workspaceRoot: nonEmptyStringSchema,
  targetDir: nonEmptyStringSchema,
  instruction: nonEmptyStringSchema,
  defaults: suiteFieldsSchema.optional(),
  write: z.boolean().default(false)
};

export const createCaseInputSchema = {
  workspaceRoot: nonEmptyStringSchema,
  suiteDir: nonEmptyStringSchema,
  instruction: nonEmptyStringSchema,
  context: caseContextSchema.optional(),
  write: z.boolean().default(false)
};

export const expandCaseInputSchema = {
  workspaceRoot: nonEmptyStringSchema,
  testcasePath: nonEmptyStringSchema,
  instruction: nonEmptyStringSchema,
  preserveFields: stringArraySchema.default([]),
  write: z.boolean().default(false)
};

export const organizeInputSchema = {
  workspaceRoot: nonEmptyStringSchema,
  testcasePath: nonEmptyStringSchema.optional(),
  testcase: casePatchSchema.optional(),
  strategy: z.enum(["risk-based", "flow-based", "component-based"]).default("flow-based"),
  mode: z.enum(["replace", "append", "auto"]).default("auto"),
  write: z.boolean().default(false)
};

export const initTestsDirectoryInputSchema = {
  workspaceRoot: nonEmptyStringSchema,
  outputDir: nonEmptyStringSchema.optional(),
  templateDir: nonEmptyStringSchema.nullable().optional(),
  write: z.boolean().default(false)
};

export const createTemplateDirectoryInputSchema = {
  workspaceRoot: nonEmptyStringSchema,
  outputDir: nonEmptyStringSchema,
  fromDir: nonEmptyStringSchema.nullable().optional(),
  write: z.boolean().default(false)
};

export const createSuiteFileInputSchema = {
  workspaceRoot: nonEmptyStringSchema,
  dir: nonEmptyStringSchema,
  id: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  fields: suiteFieldsSchema.optional(),
  write: z.boolean().default(false)
};

export const createCaseFileInputSchema = {
  workspaceRoot: nonEmptyStringSchema,
  dir: nonEmptyStringSchema,
  id: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  fields: caseFieldsSchema.optional(),
  write: z.boolean().default(false)
};

export const validateTestsDirectoryInputSchema = {
  workspaceRoot: nonEmptyStringSchema,
  dir: nonEmptyStringSchema
};

export const listTemplatesInputSchema = {
  workspaceRoot: nonEmptyStringSchema,
  dir: nonEmptyStringSchema
};

export const listSuitesInputSchema = {
  workspaceRoot: nonEmptyStringSchema,
  dir: nonEmptyStringSchema,
  filters: z
    .object({
      id: z.string().optional(),
      tag: z.string().optional()
    })
    .strict()
    .optional()
};

export const listCasesInputSchema = {
  workspaceRoot: nonEmptyStringSchema,
  dir: nonEmptyStringSchema,
  filters: z
    .object({
      id: z.string().optional(),
      status: testcaseStatusSchema.optional(),
      tags: z.array(z.string()).optional(),
      owners: z.array(z.string()).optional(),
      scopedOnly: z.boolean().optional(),
      issueHas: z.string().optional(),
      issueStatus: issueStatusSchema.optional()
    })
    .strict()
    .optional()
};

export const resolveEntityPathByIdInputSchema = {
  workspaceRoot: nonEmptyStringSchema,
  dir: nonEmptyStringSchema,
  id: nonEmptyStringSchema
};

export const updateSuiteInputSchema = {
  workspaceRoot: nonEmptyStringSchema,
  dir: nonEmptyStringSchema,
  id: nonEmptyStringSchema,
  patch: suitePatchSchema,
  write: z.boolean().default(false)
};

export const updateCaseInputSchema = {
  workspaceRoot: nonEmptyStringSchema,
  dir: nonEmptyStringSchema,
  id: nonEmptyStringSchema,
  patch: casePatchSchema,
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
  workspaceRoot: nonEmptyStringSchema,
  dir: nonEmptyStringSchema,
  sourceId: nonEmptyStringSchema,
  relatedIds: stringArraySchema.optional()
};

export const syncRelatedInputSchema = {
  workspaceRoot: nonEmptyStringSchema,
  dir: nonEmptyStringSchema,
  sourceId: nonEmptyStringSchema,
  relatedIds: stringArraySchema.optional(),
  mode: z.enum(["one-way", "two-way"]).default("two-way"),
  write: z.boolean().default(false)
};

export const getWorkspaceSnapshotInputSchema = {
  workspaceRoot: nonEmptyStringSchema,
  dir: nonEmptyStringSchema,
  excludeUnscoped: z.boolean().default(false)
};

export const suiteStatsInputSchema = {
  workspaceRoot: nonEmptyStringSchema,
  dir: nonEmptyStringSchema,
  suiteId: nonEmptyStringSchema,
  excludeUnscoped: z.boolean().default(false)
};

export const deleteEntityInputSchema = {
  workspaceRoot: nonEmptyStringSchema,
  dir: nonEmptyStringSchema,
  id: nonEmptyStringSchema,
  dryRun: z.boolean(),
  confirm: z.boolean().optional()
};

export const mutationOperationSchema = z.enum([
  "create_suite_from_prompt",
  "create_testcase_from_prompt",
  "create_suite_file",
  "create_case_file",
  "update_suite",
  "update_case"
]);

export const preflightToolInputSchema = {
  operation: mutationOperationSchema,
  draft: z.record(z.unknown())
};

const mutationInputShapeMap = {
  create_suite_from_prompt: createSuiteInputSchema,
  create_testcase_from_prompt: createCaseInputSchema,
  create_suite_file: createSuiteFileInputSchema,
  create_case_file: createCaseFileInputSchema,
  update_suite: updateSuiteInputSchema,
  update_case: updateCaseInputSchema
} as const;

export type MutationOperation = z.infer<typeof mutationOperationSchema>;

export function validateMutationDraft(operation: MutationOperation, draft: Record<string, unknown>): {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
  normalizedDraft?: Record<string, unknown>;
} {
  const schema = z.object(mutationInputShapeMap[operation]).strict();
  const parsed = schema.safeParse(draft);
  if (parsed.success) {
    return {
      valid: true,
      errors: [],
      normalizedDraft: parsed.data
    };
  }

  return {
    valid: false,
    errors: parsed.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
      message: issue.message
    }))
  };
}
