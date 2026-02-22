import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { detectEntityType, normalizeTlogPath, parseYaml, validateCase, validateSuite } from "@tlog/shared";
import {
  emitSuccess,
  ensureDirectory,
  formatOf,
  outputPath,
  toStatus,
  walkYamlFiles,
  type GlobalOptions
} from "../core.js";

export interface ValidateOptions {
  dir: string;
  failOnWarning: boolean;
  format?: string;
}

interface ValidateItem {
  path: string;
  type: "suite" | "case";
  errors: string[];
  warnings: string[];
}

export interface ListTemplatesOptions {
  dir: string;
  format?: string;
  output?: string;
}

export interface SuiteListOptions {
  dir: string;
  id?: string;
  format?: string;
  output?: string;
}

export interface CaseListOptions {
  dir: string;
  id?: string;
  tag?: string;
  status?: string;
  format?: string;
  output?: string;
}

function csvCell(value: string): string {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

function toCsv(headers: string[], rows: string[][]): string {
  return [headers.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n");
}

function toAlignedTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? "").length))
  );
  const padRow = (row: string[]) => row.map((cell, index) => cell.padEnd(widths[index])).join("  ");

  const lines = [padRow(headers)];
  if (rows.length === 0) {
    lines.push("(empty)");
    return lines.join("\n");
  }

  lines.push(...rows.map((row) => padRow(row)));
  return lines.join("\n");
}

function emitListResult(
  command: string,
  headers: string[],
  rows: string[][],
  data: Record<string, unknown>,
  format: ReturnType<typeof formatOf>,
  output?: string
): void {
  const content =
    format === "json"
      ? JSON.stringify({ ok: true, command, data }, null, 2)
      : format === "csv"
        ? toCsv(headers, rows)
        : toAlignedTable(headers, rows);

  if (output) {
    const outPath = resolve(process.cwd(), output);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${content}\n`, "utf8");
    process.stdout.write(`Wrote: ${normalizeTlogPath(outPath)}\n`);
    return;
  }

  process.stdout.write(`${content}\n`);
}

export function runValidate(cwd: string, options: ValidateOptions, globalOptions: GlobalOptions): void {
  const format = formatOf(globalOptions, options.format);
  const rootDir = resolve(cwd, options.dir);
  ensureDirectory(rootDir, "Validation target does not exist");

  const files = walkYamlFiles(rootDir);
  const results: ValidateItem[] = [];

  for (const file of files) {
    try {
      const raw = parseYaml<unknown>(readFileSync(file, "utf8"));
      const type = detectEntityType(file);
      const validation = type === "suite" ? validateSuite(raw) : validateCase(raw);

      results.push({
        path: outputPath(cwd, file),
        type,
        errors: validation.errors.map((error) => `${error.path}: ${error.message}`),
        warnings: validation.warnings.map((warning) => `${warning.path}: ${warning.message}`)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        path: outputPath(cwd, file),
        type: detectEntityType(file),
        errors: [message],
        warnings: []
      });
    }
  }

  const errors = results.flatMap((item) => item.errors.map((message) => `${item.path}: ${message}`));
  const warnings = results.flatMap((item) => item.warnings.map((message) => `${item.path}: ${message}`));
  const hasFailure = errors.length > 0 || (options.failOnWarning && warnings.length > 0);

  emitSuccess(
    "validate",
    {
      dir: normalizeTlogPath(rootDir),
      totalFiles: files.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      failOnWarning: options.failOnWarning,
      items: results
    },
    format,
    [
      `${hasFailure ? "Validation failed" : "Validation passed"}: files=${files.length}, errors=${errors.length}, warnings=${warnings.length}`,
      ...errors.map((entry) => `ERROR ${entry}`),
      ...warnings.map((entry) => `WARN ${entry}`)
    ]
  );

  if (hasFailure) {
    process.exitCode = 1;
  }
}

export function runListTemplates(cwd: string, options: ListTemplatesOptions, globalOptions: GlobalOptions): void {
  const format = formatOf(globalOptions, options.format);
  const rootDir = resolve(cwd, options.dir);
  ensureDirectory(rootDir, "Template search directory does not exist");

  const items = readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const fullPath = join(rootDir, entry.name);
      return {
        name: entry.name,
        path: normalizeTlogPath(fullPath),
        valid: existsSync(join(fullPath, "index.yaml"))
      };
    })
    .filter((entry) => entry.valid)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ valid: _, ...rest }) => rest);

  emitListResult(
    "list templates",
    ["name", "path"],
    items.map((item) => [item.name, item.path]),
    {
      dir: normalizeTlogPath(rootDir),
      count: items.length,
      items
    },
    format,
    options.output
  );
}

export function runSuiteList(cwd: string, options: SuiteListOptions, globalOptions: GlobalOptions): void {
  const format = formatOf(globalOptions, options.format);
  const rootDir = resolve(cwd, options.dir);
  ensureDirectory(rootDir, "Suite search directory does not exist");

  const files = walkYamlFiles(rootDir).filter((path) => detectEntityType(path) === "suite");
  const items = files
    .map((file) => {
      const raw = parseYaml<Record<string, unknown>>(readFileSync(file, "utf8"));
      return {
        id: typeof raw.id === "string" ? raw.id : "",
        path: outputPath(cwd, file)
      };
    })
    .filter((item) => item.id.length > 0)
    .filter((item) => (options.id ? item.id.includes(options.id) : true))
    .sort((a, b) => a.id.localeCompare(b.id));

  emitListResult(
    "suite list",
    ["id", "path"],
    items.map((item) => [item.id, item.path]),
    {
      dir: normalizeTlogPath(rootDir),
      count: items.length,
      items
    },
    format,
    options.output
  );
}

export function runCaseList(cwd: string, options: CaseListOptions, globalOptions: GlobalOptions): void {
  const format = formatOf(globalOptions, options.format);
  const rootDir = resolve(cwd, options.dir);
  ensureDirectory(rootDir, "Case search directory does not exist");

  const hasStatusFilter = options.status !== undefined;
  const statusFilter = hasStatusFilter ? toStatus(options.status) : undefined;
  const tagFilter = options.tag?.trim();

  const files = walkYamlFiles(rootDir).filter((path) => detectEntityType(path) === "case");
  const items = files
    .map((file) => {
      const raw = parseYaml<Record<string, unknown>>(readFileSync(file, "utf8"));
      const tags = Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [];
      return {
        id: typeof raw.id === "string" ? raw.id : "",
        status: typeof raw.status === "string" || raw.status === null ? raw.status : null,
        path: outputPath(cwd, file),
        tags
      };
    })
    .filter((item) => item.id.length > 0)
    .filter((item) => (options.id ? item.id.includes(options.id) : true))
    .filter((item) => (hasStatusFilter ? item.status === statusFilter : true))
    .filter((item) => (tagFilter ? item.tags.includes(tagFilter) : true))
    .map(({ tags, ...rest }) => rest)
    .sort((a, b) => a.id.localeCompare(b.id));

  emitListResult(
    "case list",
    ["id", "status", "path"],
    items.map((item) => [item.id, item.status ?? "null", item.path]),
    {
      dir: normalizeTlogPath(rootDir),
      count: items.length,
      items
    },
    format,
    options.output
  );
}
