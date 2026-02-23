export const TESTCASE_STATUSES = ["todo", "doing", "done", null] as const;
export type TestCaseStatus = (typeof TESTCASE_STATUSES)[number];

export const TEST_RESULT_STATUSES = ["pass", "fail", "skip", "block", null] as const;
export type TestResultStatus = (typeof TEST_RESULT_STATUSES)[number];

export const ISSUE_STATUSES = ["open", "doing", "resolved", "pending"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export type TlogDateString = string & { readonly __tlogDateBrand: "TlogDateString" };

export interface DurationRange {
  start: TlogDateString;
  end: TlogDateString;
}

export interface Duration {
  scheduled: DurationRange;
  actual: DurationRange;
}

export interface Suite {
  id: string;
  title: string;
  tags: string[];
  description: string;
  scoped: boolean;
  owners: string[];
  duration: Duration;
  related: string[];
  remarks: string[];
}

export interface TestItem {
  name: string;
  expected: string;
  actual: string;
  trails: string[];
  status: TestResultStatus;
}

export interface Issue {
  incident: string;
  owners: string[];
  causes: string[];
  solutinos: string[];
  status: IssueStatus;
  detectedDay: TlogDateString | null;
  completedDay: TlogDateString | null;
  related: string[];
  remarks: string[];
}

export interface TestCase {
  id: string;
  title: string;
  tags: string[];
  description: string;
  scoped: boolean;
  status: TestCaseStatus;
  operations: string[];
  related: string[];
  remarks: string[];
  completedDay: TlogDateString | null;
  tests: TestItem[];
  issues: Issue[];
}

export function isTlogDateString(value: string): value is TlogDateString {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.toISOString().slice(0, 10) === value;
}

export function asTlogDateString(value: string): TlogDateString {
  if (!isTlogDateString(value)) {
    throw new Error(`Invalid date format: ${value}. Expected YYYY-MM-DD.`);
  }

  return value;
}

export const defaultSuite: Suite = {
  id: "default",
  title: "Default Suite",
  tags: [],
  description: "tlog test suite",
  scoped: true,
  owners: [],
  duration: {
    scheduled: {
      start: asTlogDateString("1970-01-01"),
      end: asTlogDateString("1970-01-01")
    },
    actual: {
      start: asTlogDateString("1970-01-01"),
      end: asTlogDateString("1970-01-01")
    }
  },
  related: [],
  remarks: []
};
