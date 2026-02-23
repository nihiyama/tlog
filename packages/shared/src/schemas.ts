import { z } from "zod";
import { isTlogDateString } from "./domain.js";

const dateStringSchema = z
  .string()
  .refine((value) => isTlogDateString(value), "Expected date format YYYY-MM-DD");
const nullableDateStringSchema = dateStringSchema.nullable();

const nonEmptyStringSchema = z.string().min(1);
const stringArraySchema = z.array(z.string());

const durationRangeSchema = z.object({
  start: dateStringSchema,
  end: dateStringSchema
});

const durationSchema = z.object({
  scheduled: durationRangeSchema,
  actual: durationRangeSchema
});

export const testcaseStatusSchema = z.enum(["todo", "doing", "done"]);

export const testResultStatusSchema = z.enum(["pass", "fail", "skip", "block"]);

export const issueStatusSchema = z.enum(["open", "doing", "resolved", "pending"]);

export const suiteSchema = z
  .object({
    id: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    tags: stringArraySchema,
    description: z.string(),
    scoped: z.boolean(),
    owners: stringArraySchema,
    duration: durationSchema,
    related: stringArraySchema,
    remarks: stringArraySchema
  })
  .strict();

export const testItemSchema = z
  .object({
    name: nonEmptyStringSchema,
    expected: z.string(),
    actual: z.string(),
    trails: stringArraySchema,
    status: testResultStatusSchema.nullable()
  })
  .strict();

export const issueSchema = z
  .preprocess((raw) => {
    if (!raw || typeof raw !== "object") {
      return raw;
    }
    const data = raw as Record<string, unknown>;
    const next: Record<string, unknown> = { ...data };
    if (!Array.isArray(next.causes) && Array.isArray(data.cause)) {
      next.causes = data.cause;
    }
    if (!Array.isArray(next.solutions) && Array.isArray(data.solution)) {
      next.solutions = data.solution;
    }
    if (!Array.isArray(next.solutions) && Array.isArray(data.solutinos)) {
      next.solutions = data.solutinos;
    }
    return next;
  }, z
    .object({
      incident: nonEmptyStringSchema,
      owners: stringArraySchema,
      causes: stringArraySchema,
      solutions: stringArraySchema,
      status: issueStatusSchema,
      detectedDay: nullableDateStringSchema,
      completedDay: nullableDateStringSchema,
      related: stringArraySchema,
      remarks: stringArraySchema
    })
    .strict());

export const testCaseSchema = z
  .object({
    id: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    tags: stringArraySchema,
    description: z.string(),
    scoped: z.boolean(),
    status: testcaseStatusSchema.nullable(),
    operations: stringArraySchema,
    related: stringArraySchema,
    remarks: stringArraySchema,
    completedDay: nullableDateStringSchema,
    tests: z.array(testItemSchema),
    issues: z.array(issueSchema)
  })
  .strict();

export type SuiteInput = z.input<typeof suiteSchema>;
export type TestCaseInput = z.input<typeof testCaseSchema>;
