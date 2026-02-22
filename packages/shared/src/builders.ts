import { asTlogDateString, type Duration, type Suite, type TestCase, type TestCaseStatus } from "./domain.js";
import { validateCase, validateSuite } from "./validation.js";

export interface BuildDefaultSuiteInput {
  id: string;
  title: string;
  description?: string;
  scoped?: boolean;
  tags?: string[];
  owners?: string[];
  duration?: Duration;
  related?: string[];
  remarks?: string[];
}

export interface BuildDefaultCaseInput {
  id: string;
  title: string;
  description?: string;
  scoped?: boolean;
  status?: TestCaseStatus;
  tags?: string[];
  operations?: string[];
  related?: string[];
  remarks?: string[];
  completedDay?: string | null;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildDefaultDuration(): Duration {
  const today = asTlogDateString(todayDateString());
  return {
    scheduled: { start: today, end: today },
    actual: { start: today, end: today }
  };
}

export function buildDefaultSuite(input: BuildDefaultSuiteInput): Suite {
  const candidate: Suite = {
    id: input.id,
    title: input.title,
    tags: input.tags ?? [],
    description: input.description ?? "",
    scoped: input.scoped ?? true,
    owners: input.owners ?? [],
    duration: input.duration ?? buildDefaultDuration(),
    related: input.related ?? [],
    remarks: input.remarks ?? []
  };

  const validation = validateSuite(candidate);
  if (!validation.ok || !validation.data) {
    throw new Error(`Invalid suite defaults: ${validation.errors.map((err) => err.path).join(", ")}`);
  }

  return validation.data;
}

export function buildDefaultCase(input: BuildDefaultCaseInput): TestCase {
  const completedDay =
    input.completedDay === null ? null : asTlogDateString(input.completedDay ?? todayDateString());

  const candidate: TestCase = {
    id: input.id,
    title: input.title,
    tags: input.tags ?? [],
    description: input.description ?? "",
    scoped: input.scoped ?? true,
    status: input.status ?? "todo",
    operations: input.operations ?? [],
    related: input.related ?? [],
    remarks: input.remarks ?? [],
    completedDay,
    tests: [],
    issues: []
  };

  const validation = validateCase(candidate);
  if (!validation.ok || !validation.data) {
    throw new Error(`Invalid case defaults: ${validation.errors.map((err) => err.path).join(", ")}`);
  }

  return validation.data;
}
