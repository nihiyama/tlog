import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  calculateBurndown,
  detectEntityType,
  normalizeTlogPath,
  parseYaml,
  type Suite,
  type TestCase
} from "@tlog/shared";
import { CliError, emitSuccess, ensureDirectory, formatOf, walkYamlFiles, type GlobalOptions } from "../core.js";

export interface SuiteStatsOptions {
  dir: string;
  id: string;
  format?: string;
}

function findSuitePath(rootDir: string, id: string): string {
  const matches = walkYamlFiles(rootDir).filter((path) => {
    if (detectEntityType(path) !== "suite") {
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
    throw new CliError(`suite not found: ${id}`);
  }
  if (matches.length > 1) {
    throw new CliError(`Multiple suite entries found for id: ${id}`, {
      details: matches.map((item) => normalizeTlogPath(item))
    });
  }
  return matches[0];
}

export function runSuiteStats(cwd: string, options: SuiteStatsOptions, globalOptions: GlobalOptions): void {
  const format = formatOf(globalOptions, options.format);
  const rootDir = resolve(cwd, options.dir);
  ensureDirectory(rootDir, "Suite search directory does not exist");

  const suitePath = findSuitePath(rootDir, options.id);
  const suite = parseYaml<Suite>(readFileSync(suitePath, "utf8"));
  const suiteDir = dirname(suitePath);

  const cases = walkYamlFiles(suiteDir)
    .filter((path) => detectEntityType(path) === "case")
    .map((path) => parseYaml<TestCase>(readFileSync(path, "utf8")));

  const scopedCases = suite.scoped === true ? cases.filter((item) => item.scoped === true) : [];

  const statusCounts = {
    todo: scopedCases.filter((item) => item.status === "todo").length,
    doing: scopedCases.filter((item) => item.status === "doing").length,
    done: scopedCases.filter((item) => item.status === "done").length,
    null: scopedCases.filter((item) => item.status === null).length,
    total: scopedCases.length
  };

  const scheduled = calculateBurndown(scopedCases, suite.duration.scheduled.start, suite.duration.scheduled.end);
  const actual = calculateBurndown(scopedCases, suite.duration.actual.start, suite.duration.actual.end);

  emitSuccess(
    "suite stats",
    {
      id: suite.id,
      path: normalizeTlogPath(suitePath),
      statusCounts,
      duration: suite.duration,
      scheduled,
      actual
    },
    format,
    [
      `suite=${suite.id}`,
      `status todo=${statusCounts.todo} doing=${statusCounts.doing} done=${statusCounts.done} null=${statusCounts.null} total=${statusCounts.total}`,
      `scheduled ${suite.duration.scheduled.start}..${suite.duration.scheduled.end} buckets=${scheduled.buckets.length}`,
      `actual ${suite.duration.actual.start}..${suite.duration.actual.end} buckets=${actual.buckets.length}`
    ]
  );
}
