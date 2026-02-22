import { mkdir, readdir, readFile, stat } from "node:fs/promises";
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

export interface TreeNodeModel {
  id: string;
  label: string;
  type: NodeType;
  path: string;
  parentPath?: string;
  description?: string;
  status?: TestCase["status"];
  suiteAllDone?: boolean;
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
  status: TestCase["status"];
  description: string;
  tags: string[];
  suiteId?: string;
  suiteOwners: string[];
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
    .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml") && entry.name !== SUITE_FILE && !entry.name.endsWith(".suite.yaml"))
    .map((entry) => join(dir, entry.name))
    .sort();
}

export async function loadTree(rootDir: string): Promise<TreeNodeModel[]> {
  const suiteFiles = await findSuiteFiles(rootDir);
  if (suiteFiles.length === 0) {
    return [
      {
        id: "guide-no-index",
        label: "index.yaml not found",
        type: "guide",
        path: rootDir,
        description: "Run `tlog init` or create suite index.yaml"
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
      label: suiteValidation.ok && suiteValidation.data ? suite.title : `${suite.id} (invalid)`,
      type: "suite",
      path: suiteFile,
      parentPath: parentSuitePath,
      description: suiteValidation.ok ? undefined : suiteValidation.errors.map((error) => error.message).join(", ")
    };

    nodes.push(suiteNode);

    const caseFiles = await findCaseFiles(dirname(suiteFile));
    for (const caseFile of caseFiles) {
      const testCase = await readYamlFile<TestCase>(caseFile);
      const caseValidation = validateCase(testCase);
      const status = testCase.status ?? null;
      nodes.push({
        id: testCase.id,
        label: caseValidation.ok ? testCase.title : `${testCase.id} (invalid)`,
        type: "case",
        path: caseFile,
        parentPath: suiteFile,
        description: caseValidation.ok ? undefined : caseValidation.errors.map((error) => error.message).join(", "),
        status
      });
    }
  }

  const casesBySuitePath = new Map<string, TreeNodeModel[]>();
  for (const node of nodes) {
    if (node.type !== "case" || !node.parentPath) {
      continue;
    }
    const items = casesBySuitePath.get(node.parentPath) ?? [];
    items.push(node);
    casesBySuitePath.set(node.parentPath, items);
  }

  for (const node of nodes) {
    if (node.type !== "suite") {
      continue;
    }
    const suiteCases = casesBySuitePath.get(node.path) ?? [];
    node.suiteAllDone = suiteCases.length > 0 && suiteCases.every((item) => item.status === "done");
  }

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
    "title" | "description" | "tags" | "scoped" | "status" | "operations" | "related" | "remarks" | "completedDay" | "tests" | "issues"
  >
): Promise<void> {
  const current = await readYamlFile<TestCase>(path);
  const updated: TestCase = {
    ...current,
    title: patch.title,
    description: patch.description,
    tags: patch.tags,
    scoped: patch.scoped,
    status: patch.status,
    operations: patch.operations,
    related: patch.related,
    remarks: patch.remarks,
    completedDay: patch.completedDay,
    tests: patch.tests,
    issues: patch.issues
  };

  const validation = validateCase(updated);
  if (!validation.ok || !validation.data) {
    throw new Error(validation.errors.map((err) => `${err.path}: ${err.message}`).join("; "));
  }

  await writeYamlFileAtomic(path, updated);
}

export async function updateSuite(
  path: string,
  patch: Pick<Suite, "title" | "description" | "tags" | "scoped" | "owners" | "duration" | "related" | "remarks">
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

export async function getWorkspaceSnapshot(rootDir: string, filters: SearchFilters = {}): Promise<WorkspaceSnapshot> {
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
        status: testCase.status,
        description: testCase.description,
        tags: testCase.tags,
        suiteId: nodes.find((candidate) => candidate.type === "suite" && candidate.path === node.parentPath)?.id
        ,
        suiteOwners: node.parentPath && suiteMap.get(node.parentPath) ? suiteMap.get(node.parentPath)!.owners : [],
        scheduledStart: node.parentPath && suiteMap.get(node.parentPath) ? suiteMap.get(node.parentPath)!.duration.scheduled.start : undefined,
        scheduledEnd: node.parentPath && suiteMap.get(node.parentPath) ? suiteMap.get(node.parentPath)!.duration.scheduled.end : undefined
      });
    }
  }

  const filtered = Object.keys(filters).length > 0 ? filterEntities(casesToTestCase(cases), filters).items : casesToTestCase(cases);
  const allowed = new Set(filtered.map((item) => item.id));

  return {
    suites,
    cases: cases.filter((item) => allowed.has(item.id))
  };
}

function casesToTestCase(cases: CaseCard[]): TestCase[] {
  return cases.map((item) => ({
    id: item.id,
    title: item.title,
    tags: item.tags,
    description: item.description,
    scoped: true,
    status: item.status,
    operations: [],
    related: [],
    remarks: [],
    completedDay: asTlogDateString("1970-01-01"),
    tests: [],
    issues: []
  }));
}
