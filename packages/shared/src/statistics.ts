import type { TestCase } from "./domain.js";

export interface StatusSummary {
  todo: number;
  doing: number;
  done: number;
  total: number;
}

export interface BurndownBucket {
  date: string;
  plannedCompleted: number;
  actualCompleted: number;
}

export interface BurndownResult {
  summary: StatusSummary;
  buckets: BurndownBucket[];
  anomalies: string[];
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function summarizeStatus(cases: TestCase[]): StatusSummary {
  let todo = 0;
  let doing = 0;
  let done = 0;

  for (const testCase of cases) {
    if (testCase.status === "todo") {
      todo += 1;
    } else if (testCase.status === "doing") {
      doing += 1;
    } else if (testCase.status === "done") {
      done += 1;
    }
  }

  return {
    todo,
    doing,
    done,
    total: cases.length
  };
}

export function calculateBurndown(cases: TestCase[], start: string, end: string): BurndownResult {
  const anomalies: string[] = [];
  const summary = summarizeStatus(cases);

  if (summary.total === 0) {
    anomalies.push("no_target_cases");
  }

  if (start > end) {
    anomalies.push("invalid_date_range");
    return { summary, buckets: [], anomalies };
  }

  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  const days = Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  const doneCases = cases.filter((testCase) => testCase.status === "done");
  const buckets: BurndownBucket[] = [];

  for (let offset = 0; offset < days; offset += 1) {
    const day = addDays(startDate, offset);
    const dayText = formatDate(day);

    const plannedCompleted = Math.min(summary.total, Math.ceil(((offset + 1) / days) * summary.total));
    const actualCompleted = doneCases.filter((testCase) => testCase.completedDay <= dayText).length;

    buckets.push({
      date: dayText,
      plannedCompleted,
      actualCompleted
    });
  }

  return { summary, buckets, anomalies };
}
