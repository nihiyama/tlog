import { z } from "zod";
import { suiteSchema, testCaseSchema } from "./schemas.js";
import type { Suite, TestCase } from "./domain.js";

export interface ValidationDiagnostic {
  path: string;
  message: string;
}

export interface ValidationResult<T> {
  ok: boolean;
  data?: T;
  errors: ValidationDiagnostic[];
  warnings: ValidationDiagnostic[];
}

function formatPath(path: (string | number)[]): string {
  if (path.length === 0) {
    return "$";
  }

  return path
    .map((segment) => (typeof segment === "number" ? `[${segment}]` : segment))
    .join(".")
    .replace(".[", "[");
}

function mapZodErrors(error: z.ZodError): ValidationDiagnostic[] {
  return error.issues.map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message
  }));
}

function pushArrayWarnings(
  warnings: ValidationDiagnostic[],
  value: unknown,
  path: string,
  message: string
): void {
  if (Array.isArray(value) && value.length === 0) {
    warnings.push({ path, message });
  }
}

function pushStringWarnings(
  warnings: ValidationDiagnostic[],
  value: unknown,
  path: string,
  message: string
): void {
  if (typeof value === "string" && value.trim().length === 0) {
    warnings.push({ path, message });
  }
}

function buildSuiteWarnings(suite: Suite): ValidationDiagnostic[] {
  const warnings: ValidationDiagnostic[] = [];

  pushArrayWarnings(warnings, suite.tags, "tags", "tags is empty");
  pushArrayWarnings(warnings, suite.owners, "owners", "owners is empty");
  pushArrayWarnings(warnings, suite.related, "related", "related is empty");
  pushArrayWarnings(warnings, suite.remarks, "remarks", "remarks is empty");
  pushStringWarnings(warnings, suite.description, "description", "description is empty");

  return warnings;
}

function buildCaseWarnings(testCase: TestCase): ValidationDiagnostic[] {
  const warnings: ValidationDiagnostic[] = [];

  pushArrayWarnings(warnings, testCase.owners, "owners", "owners is empty");
  pushArrayWarnings(warnings, testCase.tags, "tags", "tags is empty");
  pushArrayWarnings(warnings, testCase.operations, "operations", "operations is empty");
  pushArrayWarnings(warnings, testCase.tests, "tests", "tests is empty");
  pushArrayWarnings(warnings, testCase.issues, "issues", "issues is empty");
  pushStringWarnings(warnings, testCase.description, "description", "description is empty");

  return warnings;
}

export function validateSuite(input: unknown): ValidationResult<Suite> {
  const parsed = suiteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: mapZodErrors(parsed.error),
      warnings: []
    };
  }

  return {
    ok: true,
    data: parsed.data,
    errors: [],
    warnings: buildSuiteWarnings(parsed.data)
  };
}

export function validateCase(input: unknown): ValidationResult<TestCase> {
  const parsed = testCaseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: mapZodErrors(parsed.error),
      warnings: []
    };
  }

  return {
    ok: true,
    data: parsed.data,
    errors: [],
    warnings: buildCaseWarnings(parsed.data)
  };
}
