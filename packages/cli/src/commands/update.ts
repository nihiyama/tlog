import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  asTlogDateString,
  detectEntityType,
  normalizeTlogPath,
  parseYaml,
  stringifyYaml,
  validateCase,
  validateSuite,
  type Issue,
  type Suite,
  type TestCase,
  type TestItem
} from "@tlog/shared";
import {
  CliError,
  emitSuccess,
  formatOf,
  splitCsv,
  toStatus,
  walkYamlFiles,
  type GlobalOptions
} from "../core.js";

export interface SuiteUpdateOptions {
  dir: string;
  id: string;
  title?: string;
  description?: string;
  tags?: string;
  owners?: string;
  related?: string;
  remarks?: string;
  scoped?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  actualStart?: string;
  actualEnd?: string;
}

export interface CaseUpdateOptions {
  dir: string;
  id: string;
  owners?: string;
  status?: string;
  tags?: string;
  description?: string;
  operations?: string;
  related?: string;
  remarks?: string;
  scoped?: string;
  completedDay?: string;
  testsFile?: string;
  issuesFile?: string;
}

function parseOptionalBoolean(value: string | undefined, optionName: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new CliError(`Invalid ${optionName}: ${value}. Expected true|false.`);
}

function writeYamlFileAtomicSync(path: string, value: unknown): void {
  const content = stringifyYaml(value);
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true });
  const tempPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tempPath, content, "utf8");
  renameSync(tempPath, path);
}

function findById(rootDir: string, id: string, type: "suite" | "case"): string {
  const matches = walkYamlFiles(rootDir).filter((path) => {
    if (detectEntityType(path) !== type) {
      return false;
    }
    try {
      const raw = parseYaml<Record<string, unknown>>(readFileSync(path, "utf8"));
      return raw.id === id;
    } catch {
      return false;
    }
  });

  if (matches.length === 0) {
    throw new CliError(`${type} not found: ${id}`);
  }
  if (matches.length > 1) {
    throw new CliError(`Multiple ${type} entries found for id: ${id}`, {
      details: matches.map((item) => normalizeTlogPath(item))
    });
  }
  return matches[0];
}

function readJsonArrayFile<T>(cwd: string, path: string | undefined, label: string): T[] | undefined {
  if (!path) {
    return undefined;
  }
  const fullPath = resolve(cwd, path);
  if (!existsSync(fullPath)) {
    throw new CliError(`${label} file not found: ${fullPath}`);
  }
  try {
    const data = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
    if (!Array.isArray(data)) {
      throw new CliError(`${label} must be an array: ${fullPath}`);
    }
    return data as T[];
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }
    throw new CliError(`Invalid ${label} JSON: ${fullPath}`);
  }
}

export function runSuiteUpdate(cwd: string, options: SuiteUpdateOptions, globalOptions: GlobalOptions): void {
  const format = formatOf(globalOptions);
  const rootDir = resolve(cwd, options.dir);
  const targetPath = findById(rootDir, options.id, "suite");
  const current = parseYaml<Suite>(readFileSync(targetPath, "utf8"));

  const scoped = parseOptionalBoolean(options.scoped, "scoped");
  const updated: Suite = {
    ...current,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(options.description !== undefined ? { description: options.description } : {}),
    ...(options.tags !== undefined ? { tags: splitCsv(options.tags) } : {}),
    ...(options.owners !== undefined ? { owners: splitCsv(options.owners) } : {}),
    ...(options.related !== undefined ? { related: splitCsv(options.related) } : {}),
    ...(options.remarks !== undefined ? { remarks: splitCsv(options.remarks) } : {}),
    ...(scoped !== undefined ? { scoped } : {}),
    duration: {
      scheduled: {
        start: asTlogDateString(options.scheduledStart ?? current.duration.scheduled.start),
        end: asTlogDateString(options.scheduledEnd ?? current.duration.scheduled.end)
      },
      actual: {
        start: asTlogDateString(options.actualStart ?? current.duration.actual.start),
        end: asTlogDateString(options.actualEnd ?? current.duration.actual.end)
      }
    }
  };

  const validation = validateSuite(updated);
  if (!validation.ok || !validation.data) {
    throw new CliError("Suite update validation failed", {
      details: validation.errors.map((item) => `${item.path}: ${item.message}`)
    });
  }

  if (!globalOptions.dryRun) {
    writeYamlFileAtomicSync(targetPath, updated);
  }

  emitSuccess(
    "suite update",
    {
      id: updated.id,
      path: normalizeTlogPath(targetPath),
      dryRun: globalOptions.dryRun,
      validation: {
        ok: true,
        errorCount: 0,
        warningCount: validation.warnings.length
      }
    },
    format,
    [`${globalOptions.dryRun ? "Would update" : "Updated"}: ${normalizeTlogPath(targetPath)}`]
  );
}

export function runCaseUpdate(cwd: string, options: CaseUpdateOptions, globalOptions: GlobalOptions): void {
  const format = formatOf(globalOptions);
  const rootDir = resolve(cwd, options.dir);
  const targetPath = findById(rootDir, options.id, "case");
  const current = parseYaml<TestCase>(readFileSync(targetPath, "utf8"));

  const scoped = parseOptionalBoolean(options.scoped, "scoped");
  const testItems = readJsonArrayFile<TestItem>(cwd, options.testsFile, "tests");
  const issues = readJsonArrayFile<Issue>(cwd, options.issuesFile, "issues");
  const status = options.status === undefined ? undefined : toStatus(options.status);

  const updated: TestCase = {
    ...current,
    ...(options.description !== undefined ? { description: options.description } : {}),
    ...(options.owners !== undefined ? { owners: splitCsv(options.owners) } : {}),
    ...(options.tags !== undefined ? { tags: splitCsv(options.tags) } : {}),
    ...(options.operations !== undefined ? { operations: splitCsv(options.operations) } : {}),
    ...(options.related !== undefined ? { related: splitCsv(options.related) } : {}),
    ...(options.remarks !== undefined ? { remarks: splitCsv(options.remarks) } : {}),
    ...(scoped !== undefined ? { scoped } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(options.completedDay !== undefined ? { completedDay: options.completedDay === "null" ? null : asTlogDateString(options.completedDay) } : {}),
    ...(testItems !== undefined ? { tests: testItems } : {}),
    ...(issues !== undefined ? { issues } : {})
  };

  const validation = validateCase(updated);
  if (!validation.ok || !validation.data) {
    throw new CliError("Case update validation failed", {
      details: validation.errors.map((item) => `${item.path}: ${item.message}`)
    });
  }

  if (!globalOptions.dryRun) {
    writeYamlFileAtomicSync(targetPath, updated);
  }

  emitSuccess(
    "case update",
    {
      id: updated.id,
      path: normalizeTlogPath(targetPath),
      dryRun: globalOptions.dryRun,
      validation: {
        ok: true,
        errorCount: 0,
        warningCount: validation.warnings.length
      }
    },
    format,
    [`${globalOptions.dryRun ? "Would update" : "Updated"}: ${normalizeTlogPath(targetPath)}`]
  );
}
