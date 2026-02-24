import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import {
  asTlogDateString,
  buildDefaultCase,
  buildDefaultSuite,
  stringifyYaml
} from "@tlog/shared";
import {
  CliError,
  emitSuccess,
  ensureDirectory,
  ensureValidId,
  findDuplicateId,
  formatOf,
  splitCsv,
  toStatus,
  type GlobalOptions
} from "../core.js";

export interface SuiteCreateOptions {
  dir: string;
  id: string;
  title: string;
  owners?: string;
  tags?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
}

export interface CaseCreateOptions {
  suiteDir: string;
  id: string;
  title: string;
  owners?: string;
  status?: string;
  tags?: string;
}

function safePath(path: string): string {
  return normalize(path).split("\\").join("/");
}

export function runSuiteCreate(cwd: string, options: SuiteCreateOptions, globalOptions: GlobalOptions): void {
  const format = formatOf(globalOptions);
  const rootDir = resolve(cwd, options.dir);
  mkdirSync(rootDir, { recursive: true });
  ensureValidId(options.id, "suite id");

  const existing = findDuplicateId(rootDir, options.id);
  if (existing) {
    throw new CliError(`ID already exists: ${options.id}`, {
      details: [safePath(existing)]
    });
  }

  const suiteDir = join(rootDir, options.id);
  const indexPath = join(suiteDir, "index.yaml");

  if (existsSync(indexPath)) {
    throw new CliError(`Suite file already exists: ${safePath(indexPath)}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const suite = buildDefaultSuite({
    id: options.id,
    title: options.title,
    owners: splitCsv(options.owners),
    tags: splitCsv(options.tags),
    duration: {
      scheduled: {
        start: asTlogDateString(options.scheduledStart ?? today),
        end: asTlogDateString(options.scheduledEnd ?? options.scheduledStart ?? today)
      },
      actual: {
        start: asTlogDateString(today),
        end: asTlogDateString(today)
      }
    }
  });

  if (!globalOptions.dryRun) {
    mkdirSync(suiteDir, { recursive: true });
    writeFileSync(indexPath, stringifyYaml(suite), "utf8");
  }

  emitSuccess(
    "suite create",
    {
      id: options.id,
      path: safePath(indexPath),
      dryRun: globalOptions.dryRun
    },
    format,
    [`${globalOptions.dryRun ? "Would create" : "Created"}: ${safePath(indexPath)}`]
  );
}

export function runCaseCreate(cwd: string, options: CaseCreateOptions, globalOptions: GlobalOptions): void {
  const format = formatOf(globalOptions);
  const suiteDir = resolve(cwd, options.suiteDir);
  ensureDirectory(suiteDir, "Suite directory does not exist");
  ensureValidId(options.id, "case id");

  const rootDir = dirname(suiteDir);
  const existing = findDuplicateId(rootDir, options.id);
  if (existing) {
    throw new CliError(`ID already exists: ${options.id}`, {
      details: [safePath(existing)]
    });
  }

  const casePath = join(suiteDir, `${options.id}.testcase.yaml`);
  if (existsSync(casePath)) {
    throw new CliError(`Case file already exists: ${safePath(casePath)}`);
  }

  const status = options.status === undefined ? undefined : toStatus(options.status);
  const testCase = buildDefaultCase({
    id: options.id,
    title: options.title,
    owners: splitCsv(options.owners),
    status: status === null ? undefined : status,
    tags: splitCsv(options.tags)
  });

  if (!globalOptions.dryRun) {
    writeFileSync(casePath, stringifyYaml(testCase), "utf8");
  }

  emitSuccess(
    "case create",
    {
      id: options.id,
      path: safePath(casePath),
      dryRun: globalOptions.dryRun
    },
    format,
    [`${globalOptions.dryRun ? "Would create" : "Created"}: ${safePath(casePath)}`]
  );
}
