import {
  buildDefaultCase,
  buildDefaultSuite,
  issueStatusSchema,
  testcaseStatusSchema,
  testResultStatusSchema,
  type TestCase,
  type TestCaseStatus,
  type Suite,
  validateCase,
  validateSuite
} from "@tlog/shared";
import type { NormalizationResult } from "./types.js";
import { asObject } from "./utils.js";

function mapStatusEnum(value: unknown, warnings: string[], path: string): TestCaseStatus | null {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") {
    warnings.push(`${path} was reset to null because value is not a string`);
    return null;
  }

  const lowered = value.toLowerCase();
  const parsed = testcaseStatusSchema.safeParse(lowered);
  if (!parsed.success) {
    warnings.push(`${path} value '${value}' is invalid and was reset to null`);
    return null;
  }

  if (lowered !== value) {
    warnings.push(`${path} value '${value}' was normalized to '${lowered}'`);
  }

  return parsed.data;
}

export function normalizeSuiteCandidate(raw: unknown, defaults: Partial<Suite> = {}): NormalizationResult<Suite> {
  const warnings: string[] = [];
  const obj = asObject(raw);
  const defaulted = buildDefaultSuite({
    id: typeof defaults.id === "string" ? defaults.id : "suite-default",
    title: typeof defaults.title === "string" ? defaults.title : "Suite Default"
  });

  const suiteCandidate: Suite = {
    ...defaulted,
    ...defaults,
    id: typeof obj.id === "string" && obj.id.trim().length > 0 ? obj.id.trim() : defaulted.id,
    title: typeof obj.title === "string" && obj.title.trim().length > 0 ? obj.title.trim() : defaulted.title,
    tags: Array.isArray(obj.tags) ? obj.tags.filter((v): v is string => typeof v === "string") : defaulted.tags,
    description: typeof obj.description === "string" ? obj.description : defaulted.description,
    scoped: typeof obj.scoped === "boolean" ? obj.scoped : defaulted.scoped,
    owners: Array.isArray(obj.owners) ? obj.owners.filter((v): v is string => typeof v === "string") : defaulted.owners,
    duration:
      obj.duration && typeof obj.duration === "object"
        ? ({
            scheduled: {
              start:
                typeof asObject(obj.duration).scheduled === "object" &&
                typeof asObject(asObject(obj.duration).scheduled).start === "string"
                  ? String(asObject(asObject(obj.duration).scheduled).start)
                  : defaulted.duration.scheduled.start,
              end:
                typeof asObject(obj.duration).scheduled === "object" &&
                typeof asObject(asObject(obj.duration).scheduled).end === "string"
                  ? String(asObject(asObject(obj.duration).scheduled).end)
                  : defaulted.duration.scheduled.end
            },
            actual: {
              start:
                typeof asObject(obj.duration).actual === "object" &&
                typeof asObject(asObject(obj.duration).actual).start === "string"
                  ? String(asObject(asObject(obj.duration).actual).start)
                  : defaulted.duration.actual.start,
              end:
                typeof asObject(obj.duration).actual === "object" &&
                typeof asObject(asObject(obj.duration).actual).end === "string"
                  ? String(asObject(asObject(obj.duration).actual).end)
                  : defaulted.duration.actual.end
            }
          } as Suite["duration"])
        : defaulted.duration,
    related: Array.isArray(obj.related)
      ? obj.related.filter((v): v is string => typeof v === "string")
      : defaulted.related,
    remarks: Array.isArray(obj.remarks)
      ? obj.remarks.filter((v): v is string => typeof v === "string")
      : defaulted.remarks
  };

  for (const key of Object.keys(obj)) {
    if (!(key in suiteCandidate)) {
      warnings.push(`unknown suite field removed: ${key}`);
    }
  }

  const validated = validateSuite(suiteCandidate);
  if (!validated.ok || !validated.data) {
    throw new Error(`validation: ${validated.errors.map((v) => `${v.path} ${v.message}`).join(", ")}`);
  }

  return {
    entity: validated.data,
    warnings: [...warnings, ...validated.warnings.map((v) => `${v.path}: ${v.message}`)]
  };
}

export function normalizeCaseCandidate(raw: unknown, defaults: Partial<TestCase> = {}): NormalizationResult<TestCase> {
  const warnings: string[] = [];
  const obj = asObject(raw);
  const defaulted = buildDefaultCase({
    id: typeof defaults.id === "string" ? defaults.id : "case-default",
    title: typeof defaults.title === "string" ? defaults.title : "Case Default"
  });

  const tests = Array.isArray(obj.tests)
    ? obj.tests
        .map((item, idx) => {
          const test = asObject(item);
          const normalizedStatusRaw =
            typeof test.status === "string" || test.status == null ? test.status : String(test.status);
          const normalizedStatus = testResultStatusSchema.safeParse(
            typeof normalizedStatusRaw === "string" ? normalizedStatusRaw.toLowerCase() : normalizedStatusRaw
          );
          if (!normalizedStatus.success) {
            warnings.push(`tests[${idx}].status was reset to null`);
          }

          return {
            name: typeof test.name === "string" ? test.name : `test-${idx + 1}`,
            expected: typeof test.expected === "string" ? test.expected : "",
            actual: typeof test.actual === "string" ? test.actual : "",
            trails: Array.isArray(test.trails) ? test.trails.filter((v): v is string => typeof v === "string") : [],
            status: normalizedStatus.success ? normalizedStatus.data : null
          };
        })
        .filter((item) => item.name.trim().length > 0)
    : defaulted.tests;

  const issues = Array.isArray(obj.issues)
    ? obj.issues.map((item, idx) => {
        const issue = asObject(item);
        const statusRaw = typeof issue.status === "string" ? issue.status.toLowerCase() : "open";
        const statusParsed = issueStatusSchema.safeParse(statusRaw);
        if (!statusParsed.success) {
          warnings.push(`issues[${idx}].status was normalized to open`);
        }

        const normalizedIssueCompletedDay =
          typeof issue.completedDay === "string" || issue.completedDay === null
            ? issue.completedDay
            : null;
        const normalizedIssueDetectedDay =
          typeof issue.detectedDay === "string" || issue.detectedDay === null
            ? issue.detectedDay
            : null;

        return {
          incident: typeof issue.incident === "string" ? issue.incident : `issue-${idx + 1}`,
          owners: Array.isArray(issue.owners) ? issue.owners.filter((v): v is string => typeof v === "string") : [],
          causes: Array.isArray(issue.causes)
            ? issue.causes.filter((v): v is string => typeof v === "string")
            : [],
          solutinos: Array.isArray(issue.solutinos)
            ? issue.solutinos.filter((v): v is string => typeof v === "string")
            : [],
          status: statusParsed.success ? statusParsed.data : "open",
          detectedDay: normalizedIssueDetectedDay,
          completedDay: normalizedIssueCompletedDay,
          related: Array.isArray(issue.related)
            ? issue.related.filter((v): v is string => typeof v === "string")
            : [],
          remarks: Array.isArray(issue.remarks)
            ? issue.remarks.filter((v): v is string => typeof v === "string")
            : []
        };
      })
    : defaulted.issues;

  const caseCandidate = {
    ...defaulted,
    ...defaults,
    id: typeof obj.id === "string" && obj.id.trim().length > 0 ? obj.id.trim() : defaulted.id,
    title: typeof obj.title === "string" && obj.title.trim().length > 0 ? obj.title.trim() : defaulted.title,
    tags: Array.isArray(obj.tags) ? obj.tags.filter((v): v is string => typeof v === "string") : defaulted.tags,
    description: typeof obj.description === "string" ? obj.description : defaulted.description,
    scoped: typeof obj.scoped === "boolean" ? obj.scoped : defaulted.scoped,
    status: mapStatusEnum(obj.status, warnings, "status"),
    operations: Array.isArray(obj.operations)
      ? obj.operations.filter((v): v is string => typeof v === "string")
      : defaulted.operations,
    related: Array.isArray(obj.related)
      ? obj.related.filter((v): v is string => typeof v === "string")
      : defaulted.related,
    remarks: Array.isArray(obj.remarks)
      ? obj.remarks.filter((v): v is string => typeof v === "string")
      : defaulted.remarks,
    completedDay:
      typeof obj.completedDay === "string" || obj.completedDay === null ? obj.completedDay : defaulted.completedDay,
    tests,
    issues
  };

  for (const key of Object.keys(obj)) {
    if (!(key in caseCandidate)) {
      warnings.push(`unknown testcase field removed: ${key}`);
    }
  }

  const validated = validateCase(caseCandidate);
  if (!validated.ok || !validated.data) {
    throw new Error(`validation: ${validated.errors.map((v) => `${v.path} ${v.message}`).join(", ")}`);
  }

  return {
    entity: validated.data,
    warnings: [...warnings, ...validated.warnings.map((v) => `${v.path}: ${v.message}`)]
  };
}
