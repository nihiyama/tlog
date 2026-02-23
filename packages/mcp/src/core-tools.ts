import { mkdir, readdir, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  calculateBurndown,
  buildCaseFileName,
  buildDefaultCase,
  buildDefaultSuite,
  buildIdIndex,
  detectEntityType,
  extractTemplateFromDirectory,
  readYamlFile,
  resolveById,
  stringifyYaml,
  suiteSchema,
  testCaseSchema,
  type TestCase,
  type Suite,
  validateCase,
  validateSuite,
  writeYamlFileAtomic
} from "@tlog/shared";
import type { FileWriteResult } from "./types.js";
import { normalizeCaseCandidate, normalizeSuiteCandidate } from "./normalization.js";
import {
  asObject,
  assertNoOverwrite,
  extractPromptMetadata,
  listYamlFiles,
  resolvePathInsideWorkspace,
  selectAppliedMode,
  summarizeDiff,
  toRelativePath
} from "./utils.js";

function inferDescriptionFromText(value: string | undefined, fallbackTitle: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallbackTitle;
}

function planPathForSuite(workspaceRoot: string, targetDir: string, _suite: Suite): string {
  const resolvedDir = resolvePathInsideWorkspace(workspaceRoot, targetDir);
  return join(resolvedDir, "index.yaml");
}

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function assertValidIdFormat(id: string): void {
  if (!ID_PATTERN.test(id)) {
    throw new Error(`validation: invalid id format (${id}) expected ^[A-Za-z0-9_-]+$`);
  }
}

async function assertNoDuplicateId(
  workspaceRoot: string,
  dir: string,
  id: string,
  currentPath?: string
): Promise<void> {
  const resolvedDir = resolvePathInsideWorkspace(workspaceRoot, dir);
  let index;
  try {
    index = await buildIdIndex(resolvedDir);
  } catch (error) {
    if (String(error).includes("ENOENT")) {
      return;
    }
    throw error;
  }

  const duplicate = index.duplicates.find((item) => item.id === id);
  if (duplicate) {
    const paths = duplicate.paths.map((path) => toRelativePath(workspaceRoot, path));
    throw new Error(`conflict: duplicate id detected (${id}) paths=${paths.join(",")}`);
  }

  const existing = index.byId.get(id);
  if (existing && existing.path !== currentPath) {
    throw new Error(`conflict: id already exists (${id}) path=${toRelativePath(workspaceRoot, existing.path)}`);
  }
}

function planPathForCase(workspaceRoot: string, targetDir: string, testCase: TestCase): string {
  const resolvedDir = resolvePathInsideWorkspace(workspaceRoot, targetDir);
  return join(resolvedDir, `${testCase.id}.testcase.yaml`);
}

async function writeEntityIfRequested(
  workspaceRoot: string,
  filePath: string,
  payload: unknown,
  write: boolean
): Promise<FileWriteResult> {
  const yamlText = stringifyYaml(payload);
  if (!write) {
    return {
      yamlText,
      writtenFile: null
    };
  }

  const resolvedPath = resolvePathInsideWorkspace(workspaceRoot, filePath);
  assertNoOverwrite(resolvedPath);
  await writeYamlFileAtomic(resolvedPath, payload);

  return {
    yamlText,
    writtenFile: toRelativePath(workspaceRoot, resolvedPath)
  };
}

export async function createSuiteFromPromptCore(input: {
  workspaceRoot: string;
  targetDir: string;
  instruction: string;
  defaults?: Partial<Suite>;
  write?: boolean;
}): Promise<Record<string, unknown>> {
  const extracted = extractPromptMetadata(input.instruction, "suite");
  assertValidIdFormat(extracted.id);
  await assertNoDuplicateId(input.workspaceRoot, input.targetDir, extracted.id);
  const defaults = input.defaults ?? {};
  const description = inferDescriptionFromText(defaults.description, extracted.title);

  const normalized = normalizeSuiteCandidate(
    {
      id: extracted.id,
      title: extracted.title,
      description,
      ...defaults
    },
    {
      id: extracted.id,
      title: extracted.title,
      description,
      ...defaults
    }
  );

  const outputPath = planPathForSuite(input.workspaceRoot, input.targetDir, normalized.entity);
  const writeResult = await writeEntityIfRequested(input.workspaceRoot, outputPath, normalized.entity, input.write ?? false);

  return {
    suite: normalized.entity,
    yamlText: writeResult.yamlText,
    writtenFile: writeResult.writtenFile,
    warnings: [...extracted.warnings, ...normalized.warnings],
    diffSummary: ["created suite"]
  };
}

export async function createTestcaseFromPromptCore(input: {
  workspaceRoot: string;
  suiteDir: string;
  instruction: string;
  context?: Record<string, unknown>;
  write?: boolean;
}): Promise<Record<string, unknown>> {
  function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  function buildTestsFromContext(context: Record<string, unknown> | undefined): Array<Record<string, unknown>> {
    if (!context) {
      return [];
    }

    const testsRaw = Array.isArray(context.tests) ? context.tests : [];
    const fromTests: Array<Record<string, unknown>> = [];
    for (let index = 0; index < testsRaw.length; index += 1) {
      const obj = asObject(testsRaw[index]);
      const expected = typeof obj.expected === "string" ? obj.expected.trim() : "";
      if (expected.length === 0) {
        continue;
      }

      fromTests.push({
        name: typeof obj.name === "string" && obj.name.trim().length > 0 ? obj.name : `generated-${index + 1}`,
        expected,
        actual: typeof obj.actual === "string" ? obj.actual : "",
        trails: Array.isArray(obj.trails) ? obj.trails.filter((v): v is string => typeof v === "string") : [],
        status: obj.status ?? null
      });
    }

    if (fromTests.length > 0) {
      return fromTests;
    }

    const expectedRaw = context.expected;
    const expectedList =
      typeof expectedRaw === "string" && expectedRaw.trim().length > 0
        ? [expectedRaw.trim()]
        : asStringArray(expectedRaw);

    return expectedList.map((expected, index) => ({
      name: `generated-${index + 1}`,
      expected,
      actual: "",
      trails: [],
      status: null
    }));
  }

  function buildCaseHintsFromInstruction(instruction: string): {
    operations: string[];
    tests: Array<Record<string, unknown>>;
    warnings: string[];
  } {
    return {
      operations: [`review instruction and derive executable steps: ${instruction}`],
      tests: [
        {
          name: "generated-1",
          expected: "期待結果を context.tests[].expected で指定してください",
          actual: "",
          trails: [],
          status: null
        }
      ],
      warnings: []
    };
  }

  const extracted = extractPromptMetadata(input.instruction, "case");
  assertValidIdFormat(extracted.id);
  await assertNoDuplicateId(input.workspaceRoot, input.suiteDir, extracted.id);
  const contextOperations = asStringArray(input.context?.operations);
  const contextTests = buildTestsFromContext(input.context);
  const inferred = buildCaseHintsFromInstruction(input.instruction);

  const operations = contextOperations.length > 0 ? contextOperations : inferred.operations;
  const tests = contextTests.length > 0 ? contextTests : inferred.tests;
  const description = inferDescriptionFromText(
    typeof input.context?.description === "string" ? input.context.description : input.instruction,
    extracted.title
  );

  const merged = {
    ...input.context,
    id: extracted.id,
    title: extracted.title,
    description,
    operations,
    tests
  };

  const normalized = normalizeCaseCandidate(merged, { id: extracted.id, title: extracted.title });

  const outputPath = planPathForCase(input.workspaceRoot, input.suiteDir, normalized.entity);
  const writeResult = await writeEntityIfRequested(input.workspaceRoot, outputPath, normalized.entity, input.write ?? false);

  return {
    testcase: normalized.entity,
    yamlText: writeResult.yamlText,
    writtenFile: writeResult.writtenFile,
    warnings: [...extracted.warnings, ...inferred.warnings, ...normalized.warnings],
    diffSummary: ["created testcase"]
  };
}

export async function expandTestcaseCore(input: {
  workspaceRoot: string;
  testcasePath: string;
  instruction: string;
  preserveFields?: string[];
  write?: boolean;
}): Promise<Record<string, unknown>> {
  const path = resolvePathInsideWorkspace(input.workspaceRoot, input.testcasePath);
  const before = await readYamlFile<unknown>(path);
  const beforeObj = asObject(before);

  const afterDraft: Record<string, unknown> = { ...beforeObj };
  const preserveFields = new Set(input.preserveFields ?? []);

  if (!preserveFields.has("description")) {
    afterDraft.description = `${String(beforeObj.description ?? "").trim()}\n${input.instruction}`.trim();
  }

  if (!preserveFields.has("operations")) {
    const operations = Array.isArray(beforeObj.operations)
      ? beforeObj.operations.filter((v): v is string => typeof v === "string")
      : [];
    operations.push(`review: ${input.instruction}`);
    afterDraft.operations = Array.from(new Set(operations));
  }

  if (!preserveFields.has("tests")) {
    const existing = Array.isArray(beforeObj.tests) ? beforeObj.tests.map((v) => asObject(v)) : [];
    existing.push({
      name: `generated-${existing.length + 1}`,
      expected: "to be confirmed",
      actual: "",
      trails: [],
      status: null
    });
    afterDraft.tests = existing;
  }

  const normalized = normalizeCaseCandidate(afterDraft, {
    id: typeof beforeObj.id === "string" ? beforeObj.id : "case-expanded",
    title: typeof beforeObj.title === "string" ? beforeObj.title : "Expanded Case"
  });

  const changes = summarizeDiff(beforeObj, normalized.entity);

  if (input.write) {
    await writeYamlFileAtomic(path, normalized.entity);
  }

  return {
    before: beforeObj,
    after: normalized.entity,
    diffSummary: changes,
    warnings: normalized.warnings,
    writtenFile: input.write ? toRelativePath(input.workspaceRoot, path) : null
  };
}

export async function organizeExecutionTargetsCore(input: {
  workspaceRoot: string;
  testcasePath?: string;
  testcase?: Record<string, unknown>;
  strategy: "risk-based" | "flow-based" | "component-based";
  mode: "replace" | "append" | "auto";
  write?: boolean;
}): Promise<Record<string, unknown>> {
  const loaded = input.testcasePath
    ? await readYamlFile<unknown>(resolvePathInsideWorkspace(input.workspaceRoot, input.testcasePath))
    : input.testcase;
  if (!loaded) {
    throw new Error("validation: testcasePath or testcase is required");
  }

  const normalized = normalizeCaseCandidate(loaded, {
    id: "organized-case",
    title: "Organized Case"
  });

  const generatedTests = [
    {
      name: `${input.strategy}-critical-path`,
      expected: "critical behaviors are covered",
      actual: "",
      trails: [],
      status: null
    },
    {
      name: `${input.strategy}-edge-cases`,
      expected: "edge cases are covered",
      actual: "",
      trails: [],
      status: null
    }
  ];

  const appliedMode = selectAppliedMode(input.mode, JSON.stringify(loaded));
  const existingNames = new Set(normalized.entity.tests.map((test) => test.name));
  const appended = generatedTests.filter((test) => !existingNames.has(test.name));

  const proposedTests = appliedMode === "replace" ? generatedTests : [...normalized.entity.tests, ...appended];

  const afterCase: TestCase = {
    ...normalized.entity,
    tests: proposedTests
  };

  const final = normalizeCaseCandidate(afterCase, { id: afterCase.id, title: afterCase.title });

  if (input.write && input.testcasePath) {
    const filePath = resolvePathInsideWorkspace(input.workspaceRoot, input.testcasePath);
    await writeYamlFileAtomic(filePath, final.entity);
  }

  return {
    proposedTests: final.entity.tests,
    rationale: [`strategy=${input.strategy}`],
    coverageGaps: ["non-functional test scope not inferred"],
    appliedMode,
    warnings: final.warnings,
    diffSummary: summarizeDiff(normalized.entity, final.entity),
    writtenFile: input.write && input.testcasePath ? input.testcasePath : null
  };
}

export async function initTestsDirectoryCore(input: {
  workspaceRoot: string;
  outputDir?: string;
  templateDir?: string | null;
  write?: boolean;
}): Promise<Record<string, unknown>> {
  const outputDir = input.outputDir ?? "./tests";
  const targetDir = resolvePathInsideWorkspace(input.workspaceRoot, outputDir);
  const plannedFiles: string[] = [];
  const writtenFiles: string[] = [];

  const baseSuite = buildDefaultSuite({ id: "default", title: "Default Suite" });
  let suite = baseSuite;
  let sampleCase = buildDefaultCase({ id: "default-case", title: "Default Case" });

  if (input.templateDir) {
    const templatePath = resolvePathInsideWorkspace(input.workspaceRoot, input.templateDir);
    const extracted = await extractTemplateFromDirectory(templatePath);
    suite = normalizeSuiteCandidate({ ...baseSuite, ...extracted.suite }, baseSuite).entity;
    sampleCase = normalizeCaseCandidate({ ...sampleCase, ...extracted.testCase }, sampleCase).entity;
  }

  const suitePath = join(targetDir, "index.yaml");
  const casePath = join(targetDir, buildCaseFileName(sampleCase.id, sampleCase.title));

  plannedFiles.push(toRelativePath(input.workspaceRoot, suitePath), toRelativePath(input.workspaceRoot, casePath));

  if (input.write) {
    await mkdir(targetDir, { recursive: true });
    assertNoOverwrite(suitePath);
    assertNoOverwrite(casePath);
    await writeYamlFileAtomic(suitePath, suite);
    await writeYamlFileAtomic(casePath, sampleCase);
    writtenFiles.push(...plannedFiles);
  }

  return {
    plannedFiles,
    writtenFiles,
    warnings: []
  };
}

export async function createTemplateDirectoryCore(input: {
  workspaceRoot: string;
  outputDir: string;
  fromDir?: string | null;
  write?: boolean;
}): Promise<Record<string, unknown>> {
  const outputDir = resolvePathInsideWorkspace(input.workspaceRoot, input.outputDir);
  const suiteTemplatePath = join(outputDir, "index.yaml");
  const caseTemplatePath = join(outputDir, "template.testcase.yaml");
  let suite = buildDefaultSuite({ id: "template-suite", title: "Template Suite" });
  let testCase = buildDefaultCase({ id: "template-case", title: "Template Case" });

  if (input.fromDir) {
    const from = resolvePathInsideWorkspace(input.workspaceRoot, input.fromDir);
    const extracted = await extractTemplateFromDirectory(from);
    suite = normalizeSuiteCandidate(extracted.suite, suite).entity;
    testCase = normalizeCaseCandidate(extracted.testCase, testCase).entity;
  }

  const plannedFiles = [
    toRelativePath(input.workspaceRoot, suiteTemplatePath),
    toRelativePath(input.workspaceRoot, caseTemplatePath)
  ];
  const writtenFiles: string[] = [];

  if (input.write) {
    await mkdir(outputDir, { recursive: true });
    assertNoOverwrite(suiteTemplatePath);
    assertNoOverwrite(caseTemplatePath);
    await writeYamlFileAtomic(suiteTemplatePath, suite);
    await writeYamlFileAtomic(caseTemplatePath, testCase);
    writtenFiles.push(...plannedFiles);
  }

  return {
    templatePath: toRelativePath(input.workspaceRoot, outputDir),
    plannedFiles,
    writtenFiles
  };
}

export async function createSuiteFileCore(input: {
  workspaceRoot: string;
  dir: string;
  id: string;
  title: string;
  fields?: Partial<Suite>;
  write?: boolean;
}): Promise<Record<string, unknown>> {
  assertValidIdFormat(input.id);
  await assertNoDuplicateId(input.workspaceRoot, input.dir, input.id);
  const description = inferDescriptionFromText(
    typeof input.fields?.description === "string" ? input.fields.description : undefined,
    input.title
  );
  const normalized = normalizeSuiteCandidate(
    { id: input.id, title: input.title, description, ...input.fields },
    { id: input.id, title: input.title, description }
  );
  const filePath = planPathForSuite(input.workspaceRoot, input.dir, normalized.entity);
  const writeResult = await writeEntityIfRequested(input.workspaceRoot, filePath, normalized.entity, input.write ?? false);

  return {
    entity: normalized.entity,
    yamlText: writeResult.yamlText,
    writtenFile: writeResult.writtenFile,
    warnings: normalized.warnings,
    diffSummary: ["created suite file"]
  };
}

export async function createCaseFileCore(input: {
  workspaceRoot: string;
  dir: string;
  id: string;
  title: string;
  fields?: Partial<TestCase>;
  write?: boolean;
}): Promise<Record<string, unknown>> {
  assertValidIdFormat(input.id);
  await assertNoDuplicateId(input.workspaceRoot, input.dir, input.id);
  const description = inferDescriptionFromText(
    typeof input.fields?.description === "string" ? input.fields.description : undefined,
    input.title
  );
  const normalized = normalizeCaseCandidate(
    { id: input.id, title: input.title, description, ...input.fields },
    { id: input.id, title: input.title, description }
  );
  const filePath = planPathForCase(input.workspaceRoot, input.dir, normalized.entity);
  const writeResult = await writeEntityIfRequested(input.workspaceRoot, filePath, normalized.entity, input.write ?? false);

  return {
    entity: normalized.entity,
    yamlText: writeResult.yamlText,
    writtenFile: writeResult.writtenFile,
    warnings: normalized.warnings,
    diffSummary: ["created case file"]
  };
}

export async function updateSuiteCore(input: {
  workspaceRoot: string;
  dir: string;
  id: string;
  patch: Partial<Suite>;
  write?: boolean;
}): Promise<Record<string, unknown>> {
  const dir = resolvePathInsideWorkspace(input.workspaceRoot, input.dir);
  assertValidIdFormat(input.id);
  const index = await buildIdIndex(dir);
  const found = resolveById(index, input.id);

  if (!found || found.type !== "suite") {
    throw new Error(`validation: suite id not found (${input.id})`);
  }
  await assertNoDuplicateId(input.workspaceRoot, input.dir, input.id, found.path);

  const before = await readYamlFile<unknown>(found.path);
  const beforeObj = asObject(before);

  if (typeof input.patch.id === "string" && input.patch.id !== input.id) {
    throw new Error("validation: id cannot be changed by update_suite");
  }

  const merged = {
    ...beforeObj,
    ...input.patch,
    id: input.id
  };

  const normalized = normalizeSuiteCandidate(merged, {
    id: input.id,
    title: typeof beforeObj.title === "string" ? beforeObj.title : "Updated Suite"
  });
  const validation = validateSuite(normalized.entity);
  if (!validation.ok || !validation.data) {
    return {
      updated: false,
      id: input.id,
      path: toRelativePath(input.workspaceRoot, found.path),
      errors: validation.errors,
      warnings: [...normalized.warnings, ...validation.warnings.map((warning) => `${warning.path}: ${warning.message}`)]
    };
  }

  if (input.write) {
    await writeYamlFileAtomic(found.path, validation.data);
  }

  return {
    updated: true,
    id: input.id,
    path: toRelativePath(input.workspaceRoot, found.path),
    before: beforeObj,
    after: validation.data,
    warnings: [...normalized.warnings, ...validation.warnings.map((warning) => `${warning.path}: ${warning.message}`)],
    diffSummary: summarizeDiff(beforeObj, validation.data),
    writtenFile: input.write ? toRelativePath(input.workspaceRoot, found.path) : null
  };
}

export async function updateCaseCore(input: {
  workspaceRoot: string;
  dir: string;
  id: string;
  patch: Partial<TestCase>;
  write?: boolean;
}): Promise<Record<string, unknown>> {
  const dir = resolvePathInsideWorkspace(input.workspaceRoot, input.dir);
  assertValidIdFormat(input.id);
  const index = await buildIdIndex(dir);
  const found = resolveById(index, input.id);

  if (!found || found.type !== "case") {
    throw new Error(`validation: case id not found (${input.id})`);
  }
  await assertNoDuplicateId(input.workspaceRoot, input.dir, input.id, found.path);

  const before = await readYamlFile<unknown>(found.path);
  const beforeObj = asObject(before);

  if (typeof input.patch.id === "string" && input.patch.id !== input.id) {
    throw new Error("validation: id cannot be changed by update_case");
  }

  const merged = {
    ...beforeObj,
    ...input.patch,
    id: input.id
  };

  const normalized = normalizeCaseCandidate(merged, {
    id: input.id,
    title: typeof beforeObj.title === "string" ? beforeObj.title : "Updated Case"
  });
  const validation = validateCase(normalized.entity);
  if (!validation.ok || !validation.data) {
    return {
      updated: false,
      id: input.id,
      path: toRelativePath(input.workspaceRoot, found.path),
      errors: validation.errors,
      warnings: [...normalized.warnings, ...validation.warnings.map((warning) => `${warning.path}: ${warning.message}`)]
    };
  }

  if (input.write) {
    await writeYamlFileAtomic(found.path, validation.data);
  }

  return {
    updated: true,
    id: input.id,
    path: toRelativePath(input.workspaceRoot, found.path),
    before: beforeObj,
    after: validation.data,
    warnings: [...normalized.warnings, ...validation.warnings.map((warning) => `${warning.path}: ${warning.message}`)],
    diffSummary: summarizeDiff(beforeObj, validation.data),
    writtenFile: input.write ? toRelativePath(input.workspaceRoot, found.path) : null
  };
}

export async function validateTestsDirectoryCore(input: {
  workspaceRoot: string;
  dir: string;
}): Promise<Record<string, unknown>> {
  const dir = resolvePathInsideWorkspace(input.workspaceRoot, input.dir);
  const files = await listYamlFiles(dir);
  const errors: Array<Record<string, unknown>> = [];
  const warnings: Array<Record<string, unknown>> = [];

  for (const file of files) {
    const loaded = await readYamlFile<unknown>(file);
    const type = detectEntityType(file);
    if (type === "suite") {
      const result = validateSuite(loaded);
      if (!result.ok) {
        errors.push({ path: toRelativePath(input.workspaceRoot, file), diagnostics: result.errors });
      }
      if (result.warnings.length > 0) {
        warnings.push({ path: toRelativePath(input.workspaceRoot, file), diagnostics: result.warnings });
      }
      continue;
    }

    const result = validateCase(loaded);
    if (!result.ok) {
      errors.push({ path: toRelativePath(input.workspaceRoot, file), diagnostics: result.errors });
    }
    if (result.warnings.length > 0) {
      warnings.push({ path: toRelativePath(input.workspaceRoot, file), diagnostics: result.warnings });
    }
  }

  return {
    errors,
    warnings,
    summary: {
      totalFiles: files.length,
      errorFiles: errors.length,
      warningFiles: warnings.length
    }
  };
}

export async function listTemplatesCore(input: {
  workspaceRoot: string;
  dir: string;
}): Promise<Record<string, unknown>> {
  const root = resolvePathInsideWorkspace(input.workspaceRoot, input.dir);
  const entries = await readdir(root, { withFileTypes: true });
  const templates: Array<{ name: string; path: string }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const path = join(root, entry.name);
    const files = await readdir(path, { withFileTypes: true });
    const hasIndex = files.some((file) => file.isFile() && file.name === "index.yaml");
    if (!hasIndex) {
      continue;
    }

    templates.push({
      name: entry.name,
      path: toRelativePath(input.workspaceRoot, path)
    });
  }

  return { templates };
}

export async function listSuitesCore(input: {
  workspaceRoot: string;
  dir: string;
  filters?: { id?: string; tag?: string };
}): Promise<Record<string, unknown>> {
  const root = resolvePathInsideWorkspace(input.workspaceRoot, input.dir);
  const files = await listYamlFiles(root);

  const suites: Array<{ id: string; path: string }> = [];
  for (const file of files) {
    if (basename(file) !== "index.yaml" && !file.endsWith(".suite.yaml")) {
      continue;
    }

    const loaded = await readYamlFile<unknown>(file);
    const parsed = suiteSchema.safeParse(loaded);
    if (!parsed.success) {
      continue;
    }

    if (input.filters?.id && parsed.data.id !== input.filters.id) {
      continue;
    }

    if (input.filters?.tag && !parsed.data.tags.includes(input.filters.tag)) {
      continue;
    }

    suites.push({
      id: parsed.data.id,
      path: toRelativePath(input.workspaceRoot, file)
    });
  }

  return { suites };
}

export async function listCasesCore(input: {
  workspaceRoot: string;
  dir: string;
  filters?: {
    id?: string;
    status?: string;
    tags?: string[];
    owners?: string[];
    scopedOnly?: boolean;
    issueHas?: string;
    issueStatus?: string;
  };
}): Promise<Record<string, unknown>> {
  const root = resolvePathInsideWorkspace(input.workspaceRoot, input.dir);
  const files = await listYamlFiles(root);

  const cases: Array<{ id: string; status: string | null; path: string }> = [];
  for (const file of files) {
    if (!file.endsWith(".testcase.yaml") && basename(file) === "index.yaml") {
      continue;
    }

    const loaded = await readYamlFile<unknown>(file);
    const parsed = testCaseSchema.safeParse(loaded);
    if (!parsed.success) {
      continue;
    }

    if (input.filters?.id && parsed.data.id !== input.filters.id) {
      continue;
    }

    if (input.filters?.status && parsed.data.status !== input.filters.status) {
      continue;
    }

    if (input.filters?.tags && input.filters.tags.length > 0) {
      const matchedTags = input.filters.tags.some((tag) => parsed.data.tags.includes(tag));
      if (!matchedTags) {
        continue;
      }
    }

    if (input.filters?.scopedOnly === true && parsed.data.scoped !== true) {
      continue;
    }

    if (input.filters?.owners && input.filters.owners.length > 0) {
      const issueOwners = parsed.data.issues.flatMap((issue) => issue.owners);
      const matchedOwners = input.filters.owners.some((owner) => issueOwners.includes(owner));
      if (!matchedOwners) {
        continue;
      }
    }

    if (input.filters?.issueStatus) {
      const hasIssueStatus = parsed.data.issues.some((issue) => issue.status === input.filters?.issueStatus);
      if (!hasIssueStatus) {
        continue;
      }
    }

    if (input.filters?.issueHas && input.filters.issueHas.trim().length > 0) {
      const keyword = input.filters.issueHas.trim().toLowerCase();
      const hasKeyword = parsed.data.issues.some((issue) => {
        const haystack = [
          issue.incident,
          ...issue.owners,
          ...issue.causes,
          ...issue.solutions,
          ...issue.remarks
        ]
          .join("\n")
          .toLowerCase();
        return haystack.includes(keyword);
      });
      if (!hasKeyword) {
        continue;
      }
    }

    cases.push({
      id: parsed.data.id,
      status: parsed.data.status,
      path: toRelativePath(input.workspaceRoot, file)
    });
  }

  return { cases };
}

export async function resolveEntityPathByIdCore(input: {
  workspaceRoot: string;
  dir: string;
  id: string;
}): Promise<Record<string, unknown>> {
  const dir = resolvePathInsideWorkspace(input.workspaceRoot, input.dir);
  const index = await buildIdIndex(dir);
  const found = resolveById(index, input.id);

  return {
    id: input.id,
    found: found
      ? {
          path: toRelativePath(input.workspaceRoot, found.path),
          type: found.type,
          title: found.title
        }
      : null,
    duplicates: index.duplicates.map((dup) => ({
      id: dup.id,
      paths: dup.paths.map((path) => toRelativePath(input.workspaceRoot, path))
    }))
  };
}

export async function resolveRelatedTargetsCore(input: {
  workspaceRoot: string;
  dir: string;
  sourceId: string;
  relatedIds?: string[];
}): Promise<Record<string, unknown>> {
  const dir = resolvePathInsideWorkspace(input.workspaceRoot, input.dir);
  const index = await buildIdIndex(dir);
  const source = resolveById(index, input.sourceId);

  if (!source) {
    throw new Error(`validation: source id not found (${input.sourceId})`);
  }

  const targetIds = input.relatedIds ?? source.related;
  const resolved: Array<Record<string, unknown>> = [];
  const missing: string[] = [];

  for (const id of targetIds) {
    const entity = resolveById(index, id);
    if (!entity) {
      missing.push(id);
      continue;
    }
    resolved.push({
      id: entity.id,
      type: entity.type,
      title: entity.title,
      path: toRelativePath(input.workspaceRoot, entity.path)
    });
  }

  return {
    source: {
      id: source.id,
      type: source.type,
      path: toRelativePath(input.workspaceRoot, source.path)
    },
    resolved,
    missing,
    warnings: missing.map((id) => `related id not found: ${id}`)
  };
}

export async function syncRelatedCore(input: {
  workspaceRoot: string;
  dir: string;
  sourceId: string;
  relatedIds?: string[];
  mode: "one-way" | "two-way";
  write?: boolean;
}): Promise<Record<string, unknown>> {
  const dir = resolvePathInsideWorkspace(input.workspaceRoot, input.dir);
  const index = await buildIdIndex(dir);
  const source = resolveById(index, input.sourceId);

  if (!source) {
    throw new Error(`validation: source id not found (${input.sourceId})`);
  }

  const targetIds = Array.from(new Set(input.relatedIds ?? source.related));
  const resolvedTargets = targetIds
    .map((id) => resolveById(index, id))
    .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity));
  const missing = targetIds.filter((id) => !resolvedTargets.some((entity) => entity.id === id));

  const sourceBefore = asObject(await readYamlFile<unknown>(source.path));
  const sourceNext = {
    ...sourceBefore,
    related: targetIds
  };

  const normalizedSource =
    source.type === "suite"
      ? normalizeSuiteCandidate(sourceNext, {
          id: source.id,
          title: typeof sourceBefore.title === "string" ? sourceBefore.title : "Synced Suite"
        })
      : normalizeCaseCandidate(sourceNext, {
          id: source.id,
          title: typeof sourceBefore.title === "string" ? sourceBefore.title : "Synced Case"
        });

  const sourceValidation = source.type === "suite" ? validateSuite(normalizedSource.entity) : validateCase(normalizedSource.entity);
  if (!sourceValidation.ok || !sourceValidation.data) {
    return {
      synced: false,
      mode: input.mode,
      sourceId: input.sourceId,
      missing,
      warnings: [...normalizedSource.warnings],
      errors: sourceValidation.errors
    };
  }

  const writePlans: Array<{ path: string; before: Record<string, unknown>; after: unknown }> = [
    {
      path: source.path,
      before: sourceBefore,
      after: sourceValidation.data
    }
  ];

  if (input.mode === "two-way") {
    for (const target of resolvedTargets) {
      const targetBefore = asObject(await readYamlFile<unknown>(target.path));
      const targetRelated = Array.isArray(targetBefore.related)
        ? targetBefore.related.filter((item): item is string => typeof item === "string")
        : [];
      const targetNext = {
        ...targetBefore,
        related: Array.from(new Set([...targetRelated, source.id]))
      };

      const normalizedTarget =
        target.type === "suite"
          ? normalizeSuiteCandidate(targetNext, {
              id: target.id,
              title: typeof targetBefore.title === "string" ? targetBefore.title : "Synced Suite"
            })
          : normalizeCaseCandidate(targetNext, {
              id: target.id,
              title: typeof targetBefore.title === "string" ? targetBefore.title : "Synced Case"
            });

      const targetValidation = target.type === "suite" ? validateSuite(normalizedTarget.entity) : validateCase(normalizedTarget.entity);
      if (!targetValidation.ok || !targetValidation.data) {
        return {
          synced: false,
          mode: input.mode,
          sourceId: input.sourceId,
          targetId: target.id,
          missing,
          warnings: [...normalizedTarget.warnings],
          errors: targetValidation.errors
        };
      }

      writePlans.push({
        path: target.path,
        before: targetBefore,
        after: targetValidation.data
      });
    }
  }

  if (input.write) {
    for (const plan of writePlans) {
      await writeYamlFileAtomic(plan.path, plan.after);
    }
  }

  return {
    synced: true,
    mode: input.mode,
    sourceId: source.id,
    targetIds: resolvedTargets.map((target) => target.id),
    missing,
    warnings: missing.map((id) => `related id not found: ${id}`),
    changed: writePlans.map((plan) => ({
      path: toRelativePath(input.workspaceRoot, plan.path),
      diffSummary: summarizeDiff(plan.before, plan.after)
    })),
    writtenFiles: input.write ? writePlans.map((plan) => toRelativePath(input.workspaceRoot, plan.path)) : []
  };
}

export async function getWorkspaceSnapshotCore(input: {
  workspaceRoot: string;
  dir: string;
  excludeUnscoped?: boolean;
}): Promise<Record<string, unknown>> {
  const suitesResult = await listSuitesCore({ workspaceRoot: input.workspaceRoot, dir: input.dir });
  const casesResult = await listCasesCore({ workspaceRoot: input.workspaceRoot, dir: input.dir });

  const suites = suitesResult.suites as Array<{ id: string; path: string }>;
  const casesRaw = casesResult.cases as Array<{ id: string; status: string | null; path: string }>;

  let cases = casesRaw;
  if (input.excludeUnscoped) {
    const root = resolvePathInsideWorkspace(input.workspaceRoot, input.dir);
    const filtered: typeof casesRaw = [];
    for (const item of casesRaw) {
      const abs = resolvePathInsideWorkspace(input.workspaceRoot, item.path);
      const loaded = await readYamlFile<unknown>(abs);
      const parsed = testCaseSchema.safeParse(loaded);
      if (!parsed.success || parsed.data.scoped !== false) {
        filtered.push(item);
      }
    }
    cases = filtered;
    void root;
  }

  return {
    snapshot: {
      suites,
      cases
    },
    summary: {
      suiteCount: suites.length,
      caseCount: cases.length
    }
  };
}

export async function suiteStatsCore(input: {
  workspaceRoot: string;
  dir: string;
  suiteId: string;
  excludeUnscoped?: boolean;
}): Promise<Record<string, unknown>> {
  const dir = resolvePathInsideWorkspace(input.workspaceRoot, input.dir);
  const index = await buildIdIndex(dir);
  const suiteEntity = resolveById(index, input.suiteId);

  if (!suiteEntity || suiteEntity.type !== "suite") {
    throw new Error(`validation: suite id not found (${input.suiteId})`);
  }

  const suiteLoaded = await readYamlFile<unknown>(suiteEntity.path);
  const suiteParsed = suiteSchema.safeParse(suiteLoaded);
  if (!suiteParsed.success) {
    throw new Error(`validation: invalid suite schema (${input.suiteId})`);
  }

  const files = await listYamlFiles(dir);
  const suiteDir = suiteEntity.path.slice(0, Math.max(0, suiteEntity.path.lastIndexOf("/")));
  const allowScopedAggregation = suiteParsed.data.scoped === true;
  const cases = [];
  for (const file of files) {
    if (!file.endsWith(".testcase.yaml")) {
      continue;
    }

    const rel = toRelativePath(input.workspaceRoot, file);
    if (suiteDir.length > 0 && !rel.startsWith(suiteDir)) {
      continue;
    }

    const loaded = await readYamlFile<unknown>(file);
    const parsed = testCaseSchema.safeParse(loaded);
    if (!parsed.success) {
      continue;
    }

    if (!allowScopedAggregation) {
      continue;
    }

    if (parsed.data.scoped !== true) {
      continue;
    }

    cases.push(parsed.data);
  }

  const burndown = calculateBurndown(
    cases,
    suiteParsed.data.duration.scheduled.start,
    suiteParsed.data.duration.scheduled.end
  );

  return {
    suite: {
      id: suiteParsed.data.id,
      title: suiteParsed.data.title,
      path: toRelativePath(input.workspaceRoot, suiteEntity.path)
    },
    summary: burndown.summary,
    burndown: burndown.buckets,
    anomalies: burndown.anomalies
  };
}

async function deleteEntityById(input: {
  workspaceRoot: string;
  dir: string;
  id: string;
  expectedType: "suite" | "case";
  dryRun: boolean;
  confirm?: boolean;
}): Promise<Record<string, unknown>> {
  const dir = resolvePathInsideWorkspace(input.workspaceRoot, input.dir);
  const index = await buildIdIndex(dir);
  const found = resolveById(index, input.id);

  if (!found || found.type !== input.expectedType) {
    throw new Error(`validation: ${input.expectedType} id not found (${input.id})`);
  }

  const impacted = index.entities
    .filter((entity) => entity.related.includes(input.id) && entity.id !== input.id)
    .map((entity) => ({
      id: entity.id,
      type: entity.type,
      path: toRelativePath(input.workspaceRoot, entity.path)
    }));

  const plan = {
    id: found.id,
    type: found.type,
    path: toRelativePath(input.workspaceRoot, found.path)
  };

  if (input.dryRun) {
    return {
      deleted: false,
      dryRun: true,
      plan,
      impacted
    };
  }

  if (input.confirm !== true) {
    throw new Error("validation: confirm=true is required when dryRun=false");
  }

  await unlink(found.path);

  return {
    deleted: true,
    dryRun: false,
    plan,
    impacted,
    writtenFiles: [toRelativePath(input.workspaceRoot, found.path)]
  };
}

export async function deleteSuiteCore(input: {
  workspaceRoot: string;
  dir: string;
  id: string;
  dryRun: boolean;
  confirm?: boolean;
}): Promise<Record<string, unknown>> {
  return deleteEntityById({ ...input, expectedType: "suite" });
}

export async function deleteCaseCore(input: {
  workspaceRoot: string;
  dir: string;
  id: string;
  dryRun: boolean;
  confirm?: boolean;
}): Promise<Record<string, unknown>> {
  return deleteEntityById({ ...input, expectedType: "case" });
}
