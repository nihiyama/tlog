import { mkdir, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  buildCaseFileName,
  buildDefaultCase,
  buildDefaultSuite,
  buildIdIndex,
  buildSuiteFileName,
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

function planPathForSuite(workspaceRoot: string, targetDir: string, suite: Suite): string {
  const resolvedDir = resolvePathInsideWorkspace(workspaceRoot, targetDir);
  return join(resolvedDir, buildSuiteFileName(suite.id, suite.title));
}

function planPathForCase(workspaceRoot: string, targetDir: string, testCase: TestCase): string {
  const resolvedDir = resolvePathInsideWorkspace(workspaceRoot, targetDir);
  return join(resolvedDir, buildCaseFileName(testCase.id, testCase.title));
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
  const defaults = input.defaults ?? {};

  const normalized = normalizeSuiteCandidate(
    {
      id: extracted.id,
      title: extracted.title,
      ...defaults
    },
    {
      id: extracted.id,
      title: extracted.title,
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
  const extracted = extractPromptMetadata(input.instruction, "case");
  const merged = {
    ...input.context,
    id: extracted.id,
    title: extracted.title
  };

  const normalized = normalizeCaseCandidate(merged, { id: extracted.id, title: extracted.title });

  const outputPath = planPathForCase(input.workspaceRoot, input.suiteDir, normalized.entity);
  const writeResult = await writeEntityIfRequested(input.workspaceRoot, outputPath, normalized.entity, input.write ?? false);

  return {
    testcase: normalized.entity,
    yamlText: writeResult.yamlText,
    writtenFile: writeResult.writtenFile,
    warnings: [...extracted.warnings, ...normalized.warnings],
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
  const normalized = normalizeSuiteCandidate(
    { id: input.id, title: input.title, ...input.fields },
    { id: input.id, title: input.title }
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
  const normalized = normalizeCaseCandidate(
    { id: input.id, title: input.title, ...input.fields },
    { id: input.id, title: input.title }
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
  filters?: { id?: string; status?: string };
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
