import { mkdirSync, readFileSync, readSync, renameSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { detectEntityType, normalizeTlogPath, parseYaml } from "@tlog/shared";
import { CliError, emitSuccess, ensureDirectory, formatOf, walkYamlFiles, type GlobalOptions } from "../core.js";

export interface DeleteOptions {
  dir: string;
  id: string;
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

function confirm(prompt: string): boolean {
  if (!process.stdin.isTTY) {
    return false;
  }
  process.stdout.write(`${prompt} [y/N]: `);
  const buffer = Buffer.alloc(32);
  const bytes = readSync(process.stdin.fd, buffer, 0, buffer.length, null);
  const input = buffer.toString("utf8", 0, bytes).trim().toLowerCase();
  return input === "y" || input === "yes";
}

function ensureInsideRoot(rootDir: string, targetPath: string): void {
  const normalizedRoot = normalizeTlogPath(resolve(rootDir));
  const normalizedTarget = normalizeTlogPath(resolve(targetPath));
  if (!normalizedTarget.startsWith(`${normalizedRoot}/`) && normalizedTarget !== normalizedRoot) {
    throw new CliError(`Target is outside root directory: ${normalizedTarget}`);
  }
}

function moveToTrash(trashBaseDir: string, sourcePath: string): string {
  const trashDir = join(trashBaseDir, ".tlog-trash");
  mkdirSync(trashDir, { recursive: true });
  const target = join(trashDir, `${Date.now()}-${randomUUID()}-${basename(sourcePath)}`);
  renameSync(sourcePath, target);
  return target;
}

export function runSuiteDelete(cwd: string, options: DeleteOptions, globalOptions: GlobalOptions): void {
  const format = formatOf(globalOptions);
  const rootDir = resolve(cwd, options.dir);
  const trashBaseDir = dirname(rootDir);
  ensureDirectory(rootDir, "Suite search directory does not exist");
  const suitePath = findById(rootDir, options.id, "suite");
  const targetPath = dirname(suitePath);
  ensureInsideRoot(rootDir, targetPath);

  if (!globalOptions.yes) {
    const accepted = confirm(`Delete suite ${options.id}?`);
    if (!accepted) {
      throw new CliError("Delete cancelled. Re-run with --yes to skip confirmation.");
    }
  }

  const trashPath = normalizeTlogPath(join(trashBaseDir, ".tlog-trash", "<generated>"));
  let movedTo: string | null = null;
  if (!globalOptions.dryRun) {
    movedTo = normalizeTlogPath(moveToTrash(trashBaseDir, targetPath));
  }

  emitSuccess(
    "suite delete",
    {
      id: options.id,
      path: normalizeTlogPath(targetPath),
      dryRun: globalOptions.dryRun,
      movedTo: movedTo ?? trashPath
    },
    format,
    [`${globalOptions.dryRun ? "Would delete" : "Deleted"}: ${normalizeTlogPath(targetPath)}`]
  );
}

export function runCaseDelete(cwd: string, options: DeleteOptions, globalOptions: GlobalOptions): void {
  const format = formatOf(globalOptions);
  const rootDir = resolve(cwd, options.dir);
  const trashBaseDir = dirname(rootDir);
  ensureDirectory(rootDir, "Case search directory does not exist");
  const targetPath = findById(rootDir, options.id, "case");
  ensureInsideRoot(rootDir, targetPath);

  if (!globalOptions.yes) {
    const accepted = confirm(`Delete case ${options.id}?`);
    if (!accepted) {
      throw new CliError("Delete cancelled. Re-run with --yes to skip confirmation.");
    }
  }

  const trashPath = normalizeTlogPath(join(trashBaseDir, ".tlog-trash", "<generated>"));
  let movedTo: string | null = null;
  if (!globalOptions.dryRun) {
    movedTo = normalizeTlogPath(moveToTrash(trashBaseDir, targetPath));
  }

  emitSuccess(
    "case delete",
    {
      id: options.id,
      path: normalizeTlogPath(targetPath),
      dryRun: globalOptions.dryRun,
      movedTo: movedTo ?? trashPath
    },
    format,
    [`${globalOptions.dryRun ? "Would delete" : "Deleted"}: ${normalizeTlogPath(targetPath)}`]
  );
}
