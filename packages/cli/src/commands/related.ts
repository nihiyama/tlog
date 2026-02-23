import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  detectEntityType,
  normalizeTlogPath,
  parseYaml,
  stringifyYaml,
  validateCase,
  validateSuite
} from "@tlog/shared";
import { CliError, emitSuccess, ensureDirectory, formatOf, walkYamlFiles, type GlobalOptions } from "../core.js";

interface RelatedEntity {
  id: string;
  path: string;
  type: "suite" | "case";
  related: string[];
  raw: Record<string, unknown>;
}

export interface RelatedSyncOptions {
  dir: string;
  id?: string;
}

export interface RelatedListOptions {
  dir: string;
  id: string;
  format?: string;
}

function writeYamlFileAtomicSync(path: string, value: unknown): void {
  const content = stringifyYaml(value);
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true });
  const tempPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tempPath, content, "utf8");
  renameSync(tempPath, path);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
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
  return [padRow(headers), ...rows.map((row) => padRow(row))].join("\n");
}

export function runRelatedSync(cwd: string, options: RelatedSyncOptions, globalOptions: GlobalOptions): void {
  const format = formatOf(globalOptions);
  const rootDir = resolve(cwd, options.dir);
  ensureDirectory(rootDir, "Related sync directory does not exist");

  const entities = walkYamlFiles(rootDir)
    .map((path) => {
      const type = detectEntityType(path);
      if (type !== "suite" && type !== "case") {
        return null;
      }
      try {
        const raw = parseYaml<Record<string, unknown>>(readFileSync(path, "utf8"));
        const id = typeof raw.id === "string" ? raw.id : "";
        const related = Array.isArray(raw.related)
          ? raw.related.filter((value): value is string => typeof value === "string")
          : [];
        if (!id) {
          return null;
        }
        return { id, path, type, related, raw } satisfies RelatedEntity;
      } catch {
        return null;
      }
    })
    .filter((item): item is RelatedEntity => item !== null);

  const index = new Map<string, RelatedEntity>();
  const duplicateIds: string[] = [];
  for (const entity of entities) {
    if (index.has(entity.id)) {
      duplicateIds.push(entity.id);
      continue;
    }
    index.set(entity.id, entity);
  }
  if (duplicateIds.length > 0) {
    throw new CliError("Duplicate ids found. related sync requires unique ids.", {
      details: unique(duplicateIds)
    });
  }

  const sources =
    options.id !== undefined
      ? (() => {
          const entity = index.get(options.id);
          if (!entity) {
            throw new CliError(`id not found: ${options.id}`);
          }
          return [entity];
        })()
      : entities;

  const unresolved: Array<{ sourceId: string; targetId: string }> = [];
  const additions = new Map<string, Set<string>>();

  for (const source of sources) {
    for (const targetId of source.related) {
      const target = index.get(targetId);
      if (!target) {
        unresolved.push({ sourceId: source.id, targetId });
        continue;
      }
      if (target.id === source.id || target.related.includes(source.id)) {
        continue;
      }
      const set = additions.get(target.path) ?? new Set<string>();
      set.add(source.id);
      additions.set(target.path, set);
    }
  }

  const changedFiles: string[] = [];
  for (const [targetPath, sourceIds] of additions.entries()) {
    const entity = entities.find((item) => item.path === targetPath);
    if (!entity) {
      continue;
    }
    const next = {
      ...entity.raw,
      related: unique([...(entity.related ?? []), ...Array.from(sourceIds)])
    };
    const validation = entity.type === "suite" ? validateSuite(next) : validateCase(next);
    if (!validation.ok || !validation.data) {
      throw new CliError(`Related sync validation failed: ${entity.id}`, {
        details: validation.errors.map((item) => `${item.path}: ${item.message}`)
      });
    }
    if (!globalOptions.dryRun) {
      writeYamlFileAtomicSync(targetPath, next);
    }
    changedFiles.push(normalizeTlogPath(targetPath));
  }

  emitSuccess(
    "related sync",
    {
      dir: normalizeTlogPath(rootDir),
      targetId: options.id ?? null,
      dryRun: globalOptions.dryRun,
      syncedCount: changedFiles.length,
      changedFiles,
      unresolved
    },
    format,
    [
      `${globalOptions.dryRun ? "Would sync" : "Synced"} related links: ${changedFiles.length}`,
      ...(unresolved.length > 0 ? unresolved.map((item) => `UNRESOLVED ${item.sourceId} -> ${item.targetId}`) : [])
    ]
  );
}

export function runRelatedList(cwd: string, options: RelatedListOptions, globalOptions: GlobalOptions): void {
  const format = formatOf(globalOptions, options.format);
  const rootDir = resolve(cwd, options.dir);
  ensureDirectory(rootDir, "Related list directory does not exist");

  const entities = walkYamlFiles(rootDir)
    .map((path) => {
      const type = detectEntityType(path);
      if (type !== "suite" && type !== "case") {
        return null;
      }
      try {
        const raw = parseYaml<Record<string, unknown>>(readFileSync(path, "utf8"));
        const id = typeof raw.id === "string" ? raw.id : "";
        const related = Array.isArray(raw.related)
          ? raw.related.filter((value): value is string => typeof value === "string")
          : [];
        if (!id) {
          return null;
        }
        return { id, path, type, related } as const;
      } catch {
        return null;
      }
    })
    .filter((item): item is { id: string; path: string; type: "suite" | "case"; related: string[] } => item !== null);

  const index = new Map(entities.map((item) => [item.id, item]));
  const source = index.get(options.id);
  if (!source) {
    throw new CliError(`id not found: ${options.id}`);
  }

  const resolved: Array<{ type: "suite" | "case"; id: string; path: string }> = [];
  const unresolved: string[] = [];
  for (const relatedId of source.related) {
    const target = index.get(relatedId);
    if (!target) {
      unresolved.push(relatedId);
      continue;
    }
    resolved.push({
      type: target.type,
      id: target.id,
      path: normalizeTlogPath(target.path)
    });
  }

  const payload = {
    id: source.id,
    path: normalizeTlogPath(source.path),
    resolved,
    unresolved
  };

  if (format === "json") {
    process.stdout.write(`${JSON.stringify({ ok: true, command: "related list", data: payload }, null, 2)}\n`);
    return;
  }

  const headers = ["status", "type", "id", "path"];
  const rows = [
    ...resolved.map((item) => ["resolved", item.type, item.id, item.path]),
    ...unresolved.map((item) => ["unresolved", "-", item, "-"])
  ];

  const content = format === "csv" ? toCsv(headers, rows) : toAlignedTable(headers, rows);
  process.stdout.write(`${content}\n`);
}
