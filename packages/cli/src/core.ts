import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { Command } from "commander";
import { TESTCASE_STATUSES, normalizeTlogPath, parseYaml, type TestCaseStatus } from "@tlog/shared";

export interface GlobalOptions {
  dryRun: boolean;
  json: boolean;
  yes: boolean;
}

export type OutputFormat = "text" | "json" | "csv";

interface CliErrorOptions {
  exitCode?: number;
  details?: string[];
}

export class CliError extends Error {
  public readonly exitCode: number;
  public readonly details: string[];

  constructor(message: string, options: CliErrorOptions = {}) {
    super(message);
    this.name = "CliError";
    this.exitCode = options.exitCode ?? 1;
    this.details = options.details ?? [];
  }
}

export function splitCsv(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function ensureValidId(id: string, label = "id"): void {
  if (!ID_PATTERN.test(id)) {
    throw new CliError(`Invalid ${label}: ${id}. Expected pattern ^[A-Za-z0-9_-]+$.`);
  }
}

export function toStatus(value: string | undefined): TestCaseStatus | null {
  if (value === undefined || value === "null") {
    return null;
  }

  const valid = TESTCASE_STATUSES.filter((item): item is Exclude<TestCaseStatus, null> => item !== null);
  if (valid.includes(value as Exclude<TestCaseStatus, null>)) {
    return value as Exclude<TestCaseStatus, null>;
  }

  throw new CliError(`Invalid status: ${value}. Expected todo|doing|done|null.`);
}

export function ensureDirectory(path: string, messagePrefix: string): void {
  if (!existsSync(path)) {
    throw new CliError(`${messagePrefix}: ${path}`);
  }

  if (!statSync(path).isDirectory()) {
    throw new CliError(`Not a directory: ${path}`);
  }
}

export function walkYamlFiles(rootDir: string): string[] {
  const queue = [rootDir];
  const files: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".yaml")) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

export function findDuplicateId(rootDir: string, id: string): string | null {
  if (!existsSync(rootDir)) {
    return null;
  }

  const files = walkYamlFiles(rootDir);
  for (const file of files) {
    try {
      const raw = parseYaml<Record<string, unknown>>(readFileSync(file, "utf8"));
      if (raw.id === id) {
        return file;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export function formatOf(globalOptions: GlobalOptions, format?: string): OutputFormat {
  if (globalOptions.json || format === "json") {
    return "json";
  }
  if (format === "csv") {
    return "csv";
  }

  return "text";
}

function writeText(text: string): void {
  process.stdout.write(`${text}\n`);
}

function writeErrorText(text: string): void {
  process.stderr.write(`${text}\n`);
}

export function emitSuccess(
  command: string,
  data: Record<string, unknown>,
  format: OutputFormat,
  textLines: string[]
): void {
  if (format === "json") {
    writeText(
      JSON.stringify(
        {
          ok: true,
          command,
          data
        },
        null,
        2
      )
    );
    return;
  }

  writeText(textLines.join("\n"));
}

export function emitFailure(command: string, error: CliError | Error, format: OutputFormat): void {
  const details = error instanceof CliError ? error.details : [];

  if (format === "json") {
    writeErrorText(
      JSON.stringify(
        {
          ok: false,
          command,
          error: {
            message: error.message,
            details
          }
        },
        null,
        2
      )
    );
    return;
  }

  writeErrorText(`Error: ${error.message}`);
  for (const detail of details) {
    writeErrorText(`- ${detail}`);
  }
}

export function outputPath(rootDir: string, targetPath: string): string {
  const rel = normalizeTlogPath(relative(rootDir, targetPath));
  return rel.length > 0 && rel !== "." ? rel : normalizeTlogPath(targetPath);
}

export function getGlobals(command: Command): GlobalOptions {
  const values = command.optsWithGlobals() as Partial<GlobalOptions>;
  return {
    dryRun: values.dryRun === true,
    json: values.json === true,
    yes: values.yes === true
  };
}
