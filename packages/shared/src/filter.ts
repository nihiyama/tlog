import type { Suite, TestCase, TestCaseStatus, TestResultStatus } from "./domain.js";

export type DateOperator = "between" | "onOrAfter" | "onOrBefore";

export interface DateFilter {
  field: "completedDay" | "duration.scheduled.start" | "duration.scheduled.end";
  operator: DateOperator;
  from: string;
  to?: string;
}

export interface SearchFilters {
  tags?: string[];
  owners?: string[];
  testcaseStatus?: TestCaseStatus[];
  testStatus?: TestResultStatus[];
  date?: DateFilter;
}

export interface FilterMeta {
  matched: boolean;
  checkedConditions: number;
  matchedConditions: number;
  reasons: string[];
}

function intersects(values: string[], conditions: string[]): boolean {
  return conditions.some((condition) => values.includes(condition));
}

function compareDate(value: string, operator: DateOperator, from: string, to?: string): boolean {
  if (operator === "onOrAfter") {
    return value >= from;
  }
  if (operator === "onOrBefore") {
    return value <= from;
  }
  if (!to) {
    return false;
  }
  return value >= from && value <= to;
}

function extractDate(entity: Suite | TestCase, field: DateFilter["field"]): string | null {
  if (field === "completedDay") {
    return "completedDay" in entity ? entity.completedDay : null;
  }

  if (field === "duration.scheduled.start") {
    return "duration" in entity ? entity.duration.scheduled.start : null;
  }

  if (field === "duration.scheduled.end") {
    return "duration" in entity ? entity.duration.scheduled.end : null;
  }

  return null;
}

export function evaluateFilters(entity: Suite | TestCase, filters: SearchFilters): FilterMeta {
  let checkedConditions = 0;
  let matchedConditions = 0;
  const reasons: string[] = [];

  if (filters.tags && filters.tags.length > 0) {
    checkedConditions += 1;
    if (intersects(entity.tags, filters.tags)) {
      matchedConditions += 1;
      reasons.push("tags");
    }
  }

  if (filters.owners && filters.owners.length > 0 && "owners" in entity) {
    checkedConditions += 1;
    if (intersects(entity.owners, filters.owners)) {
      matchedConditions += 1;
      reasons.push("owners");
    }
  }

  if (filters.testcaseStatus && filters.testcaseStatus.length > 0 && "status" in entity) {
    checkedConditions += 1;
    if (filters.testcaseStatus.includes(entity.status)) {
      matchedConditions += 1;
      reasons.push("testcaseStatus");
    }
  }

  if (filters.testStatus && filters.testStatus.length > 0 && "tests" in entity) {
    checkedConditions += 1;
    if (entity.tests.some((item) => filters.testStatus?.includes(item.status))) {
      matchedConditions += 1;
      reasons.push("testStatus");
    }
  }

  if (filters.date) {
    checkedConditions += 1;
    const value = extractDate(entity, filters.date.field);
    if (value && compareDate(value, filters.date.operator, filters.date.from, filters.date.to)) {
      matchedConditions += 1;
      reasons.push("date");
    }
  }

  const matched = checkedConditions === matchedConditions;
  return { matched, checkedConditions, matchedConditions, reasons };
}

export function filterEntities<T extends Suite | TestCase>(entities: T[], filters: SearchFilters): {
  items: T[];
  meta: FilterMeta;
} {
  const evaluations = entities.map((entity) => ({
    entity,
    meta: evaluateFilters(entity, filters)
  }));

  const filtered = evaluations.filter(({ meta }) => meta.matched).map(({ entity }) => entity);
  const checkedConditions = evaluations.reduce((sum, { meta }) => sum + meta.checkedConditions, 0);
  const matchedConditions = evaluations.reduce((sum, { meta }) => sum + meta.matchedConditions, 0);
  const reasons = Array.from(new Set(evaluations.flatMap(({ meta }) => meta.reasons)));

  return {
    items: filtered,
    meta: {
      matched: filtered.length > 0,
      checkedConditions,
      matchedConditions,
      reasons
    }
  };
}
