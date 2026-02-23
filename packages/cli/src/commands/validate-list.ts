import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ISSUE_STATUSES, detectEntityType, normalizeTlogPath, parseYaml, validateCase, validateSuite } from "@tlog/shared";
import {
  CliError,
  emitSuccess,
  ensureDirectory,
  formatOf,
  outputPath,
  splitCsv,
  toStatus,
  walkYamlFiles,
  type GlobalOptions
} from "../core.js";

export interface ValidateOptions {
  dir: string;
  failOnWarning: boolean;
  format?: string;
  watch?: boolean;
  watchInterval?: string;
}

interface ValidateItem {
  path: string;
  type: "suite" | "case";
  errors: string[];
  warnings: string[];
}

interface ValidateSummary {
  rootDir: string;
  files: string[];
  items: ValidateItem[];
  errors: string[];
  warnings: string[];
  hasFailure: boolean;
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
  owners?: string;
  scopedOnly?: boolean;
  issueHas?: string;
  issueStatus?: string;
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

  const intervalMs = Number.parseInt(options.watchInterval ?? "1000", 10);
  if (options.watch) {
    if (process.env.CI) {
      throw new CliError("Watch mode is disabled in CI environment.");
    }
    if (!Number.isFinite(intervalMs) || intervalMs < 200) {
      throw new CliError(`Invalid watch interval: ${options.watchInterval ?? ""}. Expected integer >= 200.`);
    }

    let previous: ValidateSummary | null = null;
    let previousSignature = "";
    const runOnce = () => {
      const signature = buildWatchSignature(rootDir);
      if (signature === previousSignature) {
        return;
      }
      previousSignature = signature;
      const current = collectValidation(cwd, rootDir, options.failOnWarning);
      if (previous) {
        process.stdout.write(
          `Change detected: errors ${previous.errors.length} -> ${current.errors.length}, warnings ${previous.warnings.length} -> ${current.warnings.length}\n`
        );
      }
      emitValidationResult(current, format, options.failOnWarning);
      previous = current;
    };

    runOnce();
    process.stdout.write(`Watching: ${normalizeTlogPath(rootDir)} (interval=${intervalMs}ms)\n`);
    const timer = setInterval(runOnce, intervalMs);
    process.on("SIGINT", () => {
      clearInterval(timer);
      process.stdout.write("Stopped watch mode.\n");
      process.exit(0);
    });
    return;
  }

  const summary = collectValidation(cwd, rootDir, options.failOnWarning);
  emitValidationResult(summary, format, options.failOnWarning);

  if (summary.hasFailure) {
    process.exitCode = 1;
  }
}

function collectValidation(cwd: string, rootDir: string, failOnWarning: boolean): ValidateSummary {
  const files = walkYamlFiles(rootDir);
  const items: ValidateItem[] = [];

  for (const file of files) {
    try {
      const raw = parseYaml<unknown>(readFileSync(file, "utf8"));
      const type = detectEntityType(file);
      const validation = type === "suite" ? validateSuite(raw) : validateCase(raw);

      items.push({
        path: outputPath(cwd, file),
        type,
        errors: validation.errors.map((error) => `${error.path}: ${error.message}`),
        warnings: validation.warnings.map((warning) => `${warning.path}: ${warning.message}`)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      items.push({
        path: outputPath(cwd, file),
        type: detectEntityType(file),
        errors: [message],
        warnings: []
      });
    }
  }

  const errors = items.flatMap((item) => item.errors.map((message) => `${item.path}: ${message}`));
  const warnings = items.flatMap((item) => item.warnings.map((message) => `${item.path}: ${message}`));
  const hasFailure = errors.length > 0 || (failOnWarning && warnings.length > 0);
  return { rootDir, files, items, errors, warnings, hasFailure };
}

function emitValidationResult(summary: ValidateSummary, format: ReturnType<typeof formatOf>, failOnWarning: boolean): void {
  emitSuccess(
    "validate",
    {
      dir: normalizeTlogPath(summary.rootDir),
      totalFiles: summary.files.length,
      errorCount: summary.errors.length,
      warningCount: summary.warnings.length,
      failOnWarning,
      items: summary.items
    },
    format,
    [
      `${summary.hasFailure ? "Validation failed" : "Validation passed"}: files=${summary.files.length}, errors=${summary.errors.length}, warnings=${summary.warnings.length}`,
      ...summary.errors.map((entry) => `ERROR ${entry}`),
      ...summary.warnings.map((entry) => `WARN ${entry}`)
    ]
  );
}

function buildWatchSignature(rootDir: string): string {
  const files = walkYamlFiles(rootDir).sort();
  return files
    .map((file) => {
      const stat = statSync(file);
      return `${file}:${stat.mtimeMs}:${stat.size}`;
    })
    .join("|");
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
  const scopedOnly = options.scopedOnly === true;
  const ownerFilters = splitCsv(options.owners);
  const issueHasKeyword = options.issueHas?.trim().toLowerCase();
  const issueStatusFilter = options.issueStatus?.trim();
  const validIssueStatuses = ISSUE_STATUSES as readonly string[];
  if (issueStatusFilter && !validIssueStatuses.includes(issueStatusFilter)) {
    throw new CliError(`Invalid issue status: ${issueStatusFilter}. Expected open|doing|resolved|pending.`);
  }
  const suiteOwnersCache = new Map<string, string[]>();

  const files = walkYamlFiles(rootDir).filter((path) => detectEntityType(path) === "case");
  const items = files
    .map((file) => {
      const raw = parseYaml<Record<string, unknown>>(readFileSync(file, "utf8"));
      const suiteDir = dirname(file);
      const suitePath = join(suiteDir, "index.yaml");
      if (!suiteOwnersCache.has(suitePath)) {
        let owners: string[] = [];
        if (existsSync(suitePath)) {
          try {
            const suiteRaw = parseYaml<Record<string, unknown>>(readFileSync(suitePath, "utf8"));
            owners = Array.isArray(suiteRaw.owners)
              ? suiteRaw.owners.filter((owner): owner is string => typeof owner === "string")
              : [];
          } catch {
            owners = [];
          }
        }
        suiteOwnersCache.set(suitePath, owners);
      }

      const issues = Array.isArray(raw.issues)
        ? raw.issues.filter((issue): issue is Record<string, unknown> => issue !== null && typeof issue === "object")
        : [];
      const issueStatuses = issues
        .map((issue) => issue.status)
        .filter((status): status is string => typeof status === "string");
      const tags = Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [];
      return {
        id: typeof raw.id === "string" ? raw.id : "",
        status: typeof raw.status === "string" || raw.status === null ? raw.status : null,
        scoped: raw.scoped === true,
        suiteOwners: suiteOwnersCache.get(suitePath) ?? [],
        issueStatuses,
        issues,
        path: outputPath(cwd, file),
        tags
      };
    })
    .filter((item) => item.id.length > 0)
    .filter((item) => (options.id ? item.id.includes(options.id) : true))
    .filter((item) => (hasStatusFilter ? item.status === statusFilter : true))
    .filter((item) => (tagFilter ? item.tags.includes(tagFilter) : true))
    .filter((item) => (scopedOnly ? item.scoped : true))
    .filter((item) => (ownerFilters.length > 0 ? ownerFilters.some((owner) => item.suiteOwners.includes(owner)) : true))
    .filter((item) => (issueStatusFilter ? item.issueStatuses.includes(issueStatusFilter) : true))
    .filter((item) => {
      if (!issueHasKeyword) {
        return true;
      }
      return item.issues.some((issue) => {
        const parts = [
          issue.incident,
          issue.status,
          ...(Array.isArray(issue.owners) ? issue.owners : []),
          ...(Array.isArray(issue.causes) ? issue.causes : []),
          ...(Array.isArray(issue.solutions) ? issue.solutions : []),
          ...(Array.isArray(issue.related) ? issue.related : []),
          ...(Array.isArray(issue.remarks) ? issue.remarks : [])
        ]
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.toLowerCase());
        return parts.some((value) => value.includes(issueHasKeyword));
      });
    })
    .map((item) => ({ id: item.id, status: item.status, path: item.path }))
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
