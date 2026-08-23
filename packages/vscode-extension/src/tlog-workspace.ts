import { identityTranslate, type Translate } from "./localization.js";
import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type IdIndex,
  type SearchFilters,
  type Suite,
  type TestCase,
  asTlogDateString,
  buildDefaultCase,
  buildDefaultSuite,
  buildIdIndex,
  filterEntities,
  parseYaml,
  readYamlFile,
  resolveRelated,
  validateCase,
  validateSuite,
  writeYamlFileAtomic
} from "@tlog/shared";

export type NodeType = "suite" | "case" | "guide";
export type SuiteStatus = "default" | "doing" | "done";

export interface TreeNodeModel {
  id: string;
  label: string;
  type: NodeType;
  path: string;
  parentPath?: string;
  description?: string;
  status?: TestCase["status"];
  suiteStatus?: SuiteStatus;
}

interface SuiteStatusCounts {
  todo: number;
  doing: number;
  done: number;
}

export interface SuiteCard {
  id: string;
  title: string;
  description: string;
  path: string;
  owners: string[];
  tags: string[];
}

export interface CaseCard {
  id: string;
  title: string;
  path: string;
  scoped: boolean;
  status: TestCase["status"];
  description: string;
  owners: string[];
  tags: string[];
  suiteId?: string;
  suiteOwners: string[];
  suiteTags: string[];
  suiteScoped: boolean;
  issueCount: number;
  issueStatuses: string[];
  issueOwners: string[];
  scheduledStart?: string;
  scheduledEnd?: string;
}

export interface WorkspaceSnapshot {
  suites: SuiteCard[];
  cases: CaseCard[];
}

const SUITE_FILE = "index.yaml";

export async function findSuiteFiles(rootDir: string): Promise<string[]> {
  const found: string[] = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (entry.isFile() && (entry.name === SUITE_FILE || entry.name.endsWith(".suite.yaml"))) {
        found.push(fullPath);
      }
    }
  }

  return found.sort();
}

async function findCaseFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".yaml") &&
        entry.name !== SUITE_FILE &&
        !entry.name.endsWith(".suite.yaml")
    )
    .map((entry) => join(dir, entry.name))
    .sort();
}

function addStatusCounts(target: SuiteStatusCounts, source: SuiteStatusCounts): void {
  target.todo += source.todo;
  target.doing += source.doing;
  target.done += source.done;
}

function toSuiteStatus(counts: SuiteStatusCounts): SuiteStatus {
  const total = counts.todo + counts.doing + counts.done;
  if (total === 0) {
    return "default";
  }
  if (counts.doing > 0 || (counts.todo > 0 && counts.done > 0)) {
    return "doing";
  }
  return counts.done === total ? "done" : "default";
}

export function assignSuiteStatuses(nodes: TreeNodeModel[]): void {
  const suitesByPath = new Map(
    nodes.filter((node) => node.type === "suite").map((node) => [node.path, node] as const)
  );
  const countsBySuitePath = new Map<string, SuiteStatusCounts>();
  const remainingChildrenBySuitePath = new Map<string, number>();

  for (const suitePath of suitesByPath.keys()) {
    countsBySuitePath.set(suitePath, { todo: 0, doing: 0, done: 0 });
    remainingChildrenBySuitePath.set(suitePath, 0);
  }

  for (const node of nodes) {
    if (node.type === "suite" && node.parentPath && suitesByPath.has(node.parentPath)) {
      remainingChildrenBySuitePath.set(
        node.parentPath,
        (remainingChildrenBySuitePath.get(node.parentPath) ?? 0) + 1
      );
      continue;
    }
    if (node.type !== "case" || !node.parentPath) {
      continue;
    }
    const counts = countsBySuitePath.get(node.parentPath);
    if (!counts) {
      continue;
    }
    if (node.status === "doing") {
      counts.doing += 1;
    } else if (node.status === "done") {
      counts.done += 1;
    } else {
      counts.todo += 1;
    }
  }

  const pendingSuitePaths = [...remainingChildrenBySuitePath.entries()]
    .filter(([, remainingChildren]) => remainingChildren === 0)
    .map(([suitePath]) => suitePath);

  while (pendingSuitePaths.length > 0) {
    const suitePath = pendingSuitePaths.pop();
    if (!suitePath) {
      continue;
    }
    const suiteNode = suitesByPath.get(suitePath);
    const counts = countsBySuitePath.get(suitePath);
    if (!suiteNode || !counts) {
      continue;
    }

    suiteNode.suiteStatus = toSuiteStatus(counts);
    if (!suiteNode.parentPath || !suitesByPath.has(suiteNode.parentPath)) {
      continue;
    }

    const parentCounts = countsBySuitePath.get(suiteNode.parentPath);
    if (parentCounts) {
      addStatusCounts(parentCounts, counts);
    }
    const remainingChildren = (remainingChildrenBySuitePath.get(suiteNode.parentPath) ?? 1) - 1;
    remainingChildrenBySuitePath.set(suiteNode.parentPath, remainingChildren);
    if (remainingChildren === 0) {
      pendingSuitePaths.push(suiteNode.parentPath);
    }
  }
}

export async function loadTree(
  rootDir: string,
  t: Translate = identityTranslate
): Promise<TreeNodeModel[]> {
  const suiteFiles = await findSuiteFiles(rootDir);
  if (suiteFiles.length === 0) {
    return [
      {
        id: "guide-no-index",
        label: t("index.yaml not found"),
        type: "guide",
        path: rootDir,
        description: t("Run `tlog init` or create suite index.yaml")
      },
      {
        id: "guide-create-new",
        label: t("Create New"),
        type: "guide",
        path: rootDir,
        description: t("Create first suite in this root")
      }
    ];
  }

  const suitePathSet = new Set(suiteFiles);
  const nodes: TreeNodeModel[] = [];

  for (const suiteFile of suiteFiles) {
    const suite = await readYamlFile<Suite>(suiteFile);
    const suiteValidation = validateSuite(suite);
    const parentDir = dirname(dirname(suiteFile));
    const parentIndex = join(parentDir, SUITE_FILE);
    const parentSuitePath = suitePathSet.has(parentIndex) ? parentIndex : undefined;
    const suiteNode: TreeNodeModel = {
      id: suite.id,
      label:
        suiteValidation.ok && suiteValidation.data
          ? `${suite.id}: ${suite.title}`
          : `${suite.id}: ${suite.title} (${t("invalid")})`,
      type: "suite",
      path: suiteFile,
      parentPath: parentSuitePath,
      description: suiteValidation.ok
        ? undefined
        : suiteValidation.errors.map((error) => error.message).join(", ")
    };

    nodes.push(suiteNode);

    const caseFiles = await findCaseFiles(dirname(suiteFile));
    for (const caseFile of caseFiles) {
      const testCase = await readYamlFile<TestCase>(caseFile);
      const caseValidation = validateCase(testCase);
      const status = testCase.status ?? null;
      nodes.push({
        id: testCase.id,
        label: caseValidation.ok
          ? `${testCase.id}: ${testCase.title}`
          : `${testCase.id}: ${testCase.title} (${t("invalid")})`,
        type: "case",
        path: caseFile,
        parentPath: suiteFile,
        description: caseValidation.ok
          ? undefined
          : caseValidation.errors.map((error) => error.message).join(", "),
        status
      });
    }
  }

  assignSuiteStatuses(nodes);

  return nodes;
}

export interface CreateEntityInput {
  targetDirectory: string;
  id: string;
  title: string;
}

export async function createSuite(input: CreateEntityInput): Promise<string> {
  const suite = buildDefaultSuite({ id: input.id, title: input.title });
  const suiteDir = join(input.targetDirectory, suite.id);
  await mkdir(suiteDir, { recursive: true });
  const fullPath = join(suiteDir, SUITE_FILE);
  await writeYamlFileAtomic(fullPath, suite);
  return fullPath;
}

export async function createCase(input: CreateEntityInput): Promise<string> {
  const today = asTlogDateString(new Date().toISOString().slice(0, 10));
  const testCase = buildDefaultCase({ id: input.id, title: input.title, completedDay: today });
  const fileName = `${testCase.id}.yaml`;
  const fullPath = join(input.targetDirectory, fileName);
  await writeYamlFileAtomic(fullPath, testCase);
  return fullPath;
}

export async function updateCase(
  path: string,
  patch: Pick<
    TestCase,
    | "title"
    | "description"
    | "owners"
    | "tags"
    | "scoped"
    | "status"
    | "operations"
    | "related"
    | "remarks"
    | "completedDay"
    | "tests"
    | "issues"
  >
): Promise<void> {
  const current = await readYamlFile<TestCase>(path);
  const merged: TestCase = {
    ...current,
    title: patch.title,
    description: patch.description,
    tags: patch.tags,
    owners: patch.owners,
    scoped: patch.scoped,
    status: patch.status,
    operations: patch.operations,
    related: patch.related,
    remarks: patch.remarks,
    completedDay: patch.completedDay,
    tests: patch.tests,
    issues: patch.issues
  };

  const updated: TestCase = {
    id: merged.id,
    title: merged.title,
    tags: merged.tags,
    owners: merged.owners,
    description: merged.description,
    scoped: merged.scoped,
    status: merged.status,
    operations: merged.operations,
    related: merged.related,
    remarks: merged.remarks,
    completedDay: merged.completedDay,
    tests: merged.tests,
    issues: merged.issues
  };

  const validation = validateCase(updated);
  if (!validation.ok || !validation.data) {
    throw new Error(validation.errors.map((err) => `${err.path}: ${err.message}`).join("; "));
  }

  await writeYamlFileAtomic(path, updated);
}

export async function updateSuite(
  path: string,
  patch: Pick<
    Suite,
    "title" | "description" | "tags" | "scoped" | "owners" | "duration" | "related" | "remarks"
  >
): Promise<void> {
  const current = await readYamlFile<Suite>(path);
  const updated: Suite = {
    ...current,
    title: patch.title,
    description: patch.description,
    scoped: patch.scoped,
    owners: patch.owners,
    tags: patch.tags,
    duration: patch.duration,
    related: patch.related,
    remarks: patch.remarks
  };

  const validation = validateSuite(updated);
  if (!validation.ok || !validation.data) {
    throw new Error(validation.errors.map((err) => `${err.path}: ${err.message}`).join("; "));
  }

  await writeYamlFileAtomic(path, updated);
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  );
}

export async function syncReciprocalRelated(
  rootDir: string,
  sourceId: string,
  relatedIds: string[]
): Promise<void> {
  const index = await buildIdIndex(rootDir);
  const resolved = resolveRelated(index, { related: uniqueNonEmpty(relatedIds) }).resolved;

  for (const target of resolved) {
    if (target.id === sourceId) {
      continue;
    }

    if (target.type === "suite") {
      const current = await readYamlFile<Suite>(target.path);
      const nextRelated = uniqueNonEmpty([...(current.related ?? []), sourceId]);
      if (
        nextRelated.length === (current.related ?? []).length &&
        nextRelated.every((item, idx) => item === current.related[idx])
      ) {
        continue;
      }

      const updated: Suite = {
        ...current,
        related: nextRelated
      };
      const validation = validateSuite(updated);
      if (!validation.ok || !validation.data) {
        continue;
      }
      await writeYamlFileAtomic(target.path, updated);
      continue;
    }

    const current = await readYamlFile<TestCase>(target.path);
    const nextRelated = uniqueNonEmpty([...(current.related ?? []), sourceId]);
    if (
      nextRelated.length === (current.related ?? []).length &&
      nextRelated.every((item, idx) => item === current.related[idx])
    ) {
      continue;
    }

    const updated: TestCase = {
      ...current,
      related: nextRelated
    };
    const validation = validateCase(updated);
    if (!validation.ok || !validation.data) {
      continue;
    }
    await writeYamlFileAtomic(target.path, updated);
  }
}

export async function buildWorkspaceIdIndex(rootDir: string): Promise<IdIndex> {
  return buildIdIndex(rootDir);
}

export function parseYamlDocument<T>(source: string): T {
  return parseYaml<T>(source);
}

export async function readFileMtimeMs(path: string): Promise<number> {
  const file = await stat(path);
  return file.mtimeMs;
}

export function resolveRelatedIds(index: IdIndex, related: string[]): string[] {
  return resolveRelated(index, { related }).resolved.map((item) => item.id);
}

export async function getWorkspaceSnapshot(
  rootDir: string,
  filters: SearchFilters = {}
): Promise<WorkspaceSnapshot> {
  const nodes = await loadTree(rootDir);
  const suites: SuiteCard[] = [];
  const suiteMap = new Map<string, Suite>();
  const cases: CaseCard[] = [];

  for (const node of nodes) {
    if (node.type === "suite") {
      const suite = await readYamlFile<Suite>(node.path);
      suiteMap.set(node.path, suite);
      suites.push({
        id: suite.id,
        title: suite.title,
        description: suite.description,
        path: node.path,
        owners: suite.owners,
        tags: suite.tags
      });
    }

    if (node.type === "case") {
      const testCase = await readYamlFile<TestCase>(node.path);
      cases.push({
        id: testCase.id,
        title: testCase.title,
        path: node.path,
        scoped: testCase.scoped,
        status: testCase.status,
        description: testCase.description,
        owners: testCase.owners,
        tags: testCase.tags,
        suiteId: nodes.find(
          (candidate) => candidate.type === "suite" && candidate.path === node.parentPath
        )?.id,
        suiteOwners:
          node.parentPath && suiteMap.get(node.parentPath)
            ? suiteMap.get(node.parentPath)!.owners
            : [],
        suiteTags: [],
        suiteScoped: true,
        issueCount: testCase.issues.length,
        issueStatuses: Array.from(new Set(testCase.issues.map((issue) => issue.status))),
        issueOwners: Array.from(new Set(testCase.issues.flatMap((issue) => issue.owners ?? []))),
        scheduledStart:
          node.parentPath && suiteMap.get(node.parentPath)
            ? suiteMap.get(node.parentPath)!.duration.scheduled.start
            : undefined,
        scheduledEnd:
          node.parentPath && suiteMap.get(node.parentPath)
            ? suiteMap.get(node.parentPath)!.duration.scheduled.end
            : undefined
      });
    }
  }

  const suiteNodesByPath = new Map(
    nodes.filter((node) => node.type === "suite").map((node) => [node.path, node] as const)
  );
  const caseNodesByPath = new Map(
    nodes.filter((node) => node.type === "case").map((node) => [node.path, node] as const)
  );
  for (const testCase of cases) {
    const inheritedTags: string[] = [];
    let suiteScoped = true;
    let suitePath = caseNodesByPath.get(testCase.path)?.parentPath;
    while (suitePath) {
      const suite = suiteMap.get(suitePath);
      if (suite) {
        inheritedTags.push(...suite.tags);
        suiteScoped = suiteScoped && suite.scoped !== false;
      }
      suitePath = suiteNodesByPath.get(suitePath)?.parentPath;
    }
    testCase.suiteTags = Array.from(new Set(inheritedTags));
    testCase.suiteScoped = suiteScoped;
  }

  const caseEntities = casesToTestCase(cases);
  const filtered =
    Object.keys(filters).length > 0 ? filterEntities(caseEntities, filters).items : caseEntities;
  const allowedPaths = new Set(filtered.map((item) => item.path));

  return {
    suites,
    cases: cases.filter((item) => allowedPaths.has(item.path))
  };
}

function casesToTestCase(cases: CaseCard[]): Array<TestCase & { path: string }> {
  return cases.map((item) => ({
    id: item.id,
    title: item.title,
    owners: item.owners,
    tags: Array.from(new Set([...item.tags, ...item.suiteTags])),
    description: item.description,
    scoped: item.scoped,
    status: item.status,
    operations: [],
    related: [],
    remarks: [],
    completedDay: asTlogDateString("1970-01-01"),
    tests: [],
    issues: [],
    path: item.path
  }));
}
