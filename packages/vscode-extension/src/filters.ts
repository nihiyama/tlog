import type { TestCase } from "@tlog/shared";

export type TreeFilters = {
  tags: string[];
  owners: string[];
  testcaseStatus: Array<"todo" | "doing" | "done">;
  issueHas: Array<"has" | "none">;
  issueStatus: Array<"open" | "doing" | "resolved" | "pending">;
};

export function defaultTreeFilters(): TreeFilters {
  return {
    tags: [],
    owners: [],
    testcaseStatus: [],
    issueHas: [],
    issueStatus: []
  };
}

export function normalizeTreeFilters(value: Partial<TreeFilters> | undefined): TreeFilters {
  const base = defaultTreeFilters();
  if (!value) {
    return base;
  }
  return {
    tags: Array.isArray(value.tags) ? value.tags : base.tags,
    owners: Array.isArray(value.owners) ? value.owners : base.owners,
    testcaseStatus: Array.isArray(value.testcaseStatus) ? value.testcaseStatus : base.testcaseStatus,
    issueHas: Array.isArray(value.issueHas) ? value.issueHas : base.issueHas,
    issueStatus: Array.isArray(value.issueStatus) ? value.issueStatus : base.issueStatus
  };
}

export function matchCaseWithFilters(
  item: {
    status: TestCase["status"];
    suiteOwners: string[];
    issueCount: number;
    issueStatuses: string[];
  },
  filters: TreeFilters
): boolean {
  if (filters.owners.length > 0 && !filters.owners.some((owner) => item.suiteOwners.includes(owner))) {
    return false;
  }
  if (filters.testcaseStatus.length > 0 && !filters.testcaseStatus.includes((item.status ?? null) as "todo" | "doing" | "done")) {
    return false;
  }
  if (filters.issueHas.length > 0) {
    const hasIssues = item.issueCount > 0;
    const hasMatch = (hasIssues && filters.issueHas.includes("has")) || (!hasIssues && filters.issueHas.includes("none"));
    if (!hasMatch) {
      return false;
    }
  }
  if (filters.issueStatus.length > 0) {
    if (!filters.issueStatus.some((status) => item.issueStatuses.includes(status))) {
      return false;
    }
  }
  return true;
}
