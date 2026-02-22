import { z } from "zod";
import { testcaseStatusSchema, suiteSchema } from "./schemas.js";

export * from "./domain.js";
export * from "./schemas.js";
export * from "./validation.js";
export * from "./yaml-io.js";
export * from "./id-index.js";
export * from "./naming.js";
export * from "./builders.js";
export * from "./filter.js";
export * from "./statistics.js";
export * from "./template.js";
export * from "./result.js";

export const tlogSuiteSchema = suiteSchema;
export const tlogStatusSchema = testcaseStatusSchema;

export type TlogStatus = z.infer<typeof testcaseStatusSchema>;
export type TlogSuite = z.infer<typeof suiteSchema>;

export { defaultSuite as defaultTlogSuite } from "./domain.js";

export function isTlogStatus(value: string): value is TlogStatus {
  return testcaseStatusSchema.safeParse(value).success;
}
