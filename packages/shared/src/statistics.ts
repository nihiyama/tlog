import { isTlogDateString, type TestCase } from "./domain.js";

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
  plannedRemaining: number;
  actualRemaining: number;
}

export interface BurndownKpis {
  completedCases: number;
  remainingCases: number;
  progressRate: number;
}

export interface BurndownResult {
  summary: StatusSummary;
  buckets: BurndownBucket[];
  kpis: BurndownKpis;
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
/**
 * Counts only scoped cases. Done cases completed before the period are counted
 * from the first bucket; done cases completed after the period or without a
 * completion date are counted in the final bucket so that the endpoint matches
 * the KPI values.
 */

export function calculateBurndown(cases: TestCase[], start: string, end: string): BurndownResult {
  const anomalies: string[] = [];
  const scopedCases = cases.filter((testCase) => testCase.scoped !== false);
  const summary = summarizeStatus(scopedCases);
  const kpis: BurndownKpis = {
    completedCases: summary.done,
    remainingCases: Math.max(0, summary.total - summary.done),
    progressRate: summary.total > 0 ? (summary.done * 100) / summary.total : 0
  };

  if (summary.total === 0) {
    anomalies.push("no_target_cases");
  }

  if (!isTlogDateString(start) || !isTlogDateString(end) || start > end) {
    anomalies.push("invalid_date_range");
    return { summary, buckets: [], kpis, anomalies };
  }

  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  const days = Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const doneCases = scopedCases.filter((testCase) => testCase.status === "done");
  const buckets: BurndownBucket[] = [];

  for (let offset = 0; offset < days; offset += 1) {
    const day = addDays(startDate, offset);
    const dayText = formatDate(day);
    const plannedCompleted = Math.min(summary.total, Math.ceil(((offset + 1) / days) * summary.total));
    const actualCompleted = doneCases.filter((testCase) => {
      if (testCase.completedDay === null || testCase.completedDay > end) {
        return dayText === end;
      }
      return testCase.completedDay <= dayText;
    }).length;

    buckets.push({
      date: dayText,
      plannedCompleted,
      actualCompleted,
      plannedRemaining: Math.max(0, summary.total - plannedCompleted),
      actualRemaining: Math.max(0, summary.total - actualCompleted)
    });
  }

  return { summary, buckets, kpis, anomalies };
}
