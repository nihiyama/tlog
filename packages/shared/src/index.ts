import { z } from "zod";

export const tlogStatusSchema = z.enum(["todo", "doing", "done", "blocked"]);
export type TlogStatus = z.infer<typeof tlogStatusSchema>;

export const tlogSuiteSchema = z.object({
  suite: z.string().min(1),
  description: z.string().min(1),
  cases: z.array(z.string())
});
export type TlogSuite = z.infer<typeof tlogSuiteSchema>;

export const defaultTlogSuite: TlogSuite = tlogSuiteSchema.parse({
  suite: "default",
  description: "tlog test suite",
  cases: []
});

export function isTlogStatus(value: string): value is TlogStatus {
  return tlogStatusSchema.safeParse(value).success;
}
