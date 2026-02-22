import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { readYamlFile } from "./yaml-io.js";

export type TlogEntityType = "suite" | "case";

export interface TlogIndexedEntity {
  id: string;
  type: TlogEntityType;
  path: string;
  title?: string;
  related: string[];
}

export interface DuplicateId {
  id: string;
  paths: string[];
}

export interface IdIndex {
  byId: Map<string, TlogIndexedEntity>;
  entities: TlogIndexedEntity[];
  duplicates: DuplicateId[];
}

export interface RelatedResolution {
  resolved: TlogIndexedEntity[];
  missing: string[];
}

interface ScanCandidate {
  path: string;
  type: TlogEntityType;
}

async function walkYamlFiles(rootDir: string): Promise<ScanCandidate[]> {
  const queue = [rootDir];
  const result: ScanCandidate[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (entry.name.endsWith(".yaml")) {
        result.push({ path: fullPath, type: detectEntityType(fullPath) });
      }
    }
  }

  return result;
}

function parseEntity(raw: unknown, path: string, type: TlogEntityType): TlogIndexedEntity | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const data = raw as Record<string, unknown>;
  if (typeof data.id !== "string" || data.id.length === 0) {
    return null;
  }

  const title = typeof data.title === "string" ? data.title : undefined;
  const related = Array.isArray(data.related)
    ? data.related.filter((item): item is string => typeof item === "string")
    : [];

  return {
    id: data.id,
    type,
    path,
    title,
    related
  };
}

export async function buildIdIndex(rootDir: string): Promise<IdIndex> {
  const candidates = await walkYamlFiles(rootDir);
  const byId = new Map<string, TlogIndexedEntity>();
  const entities: TlogIndexedEntity[] = [];
  const duplicatePaths = new Map<string, string[]>();

  for (const candidate of candidates) {
    const parsed = parseEntity(await readYamlFile<unknown>(candidate.path), candidate.path, candidate.type);
    if (!parsed) {
      continue;
    }

    entities.push(parsed);

    const exists = byId.get(parsed.id);
    if (!exists) {
      byId.set(parsed.id, parsed);
      continue;
    }

    const paths = duplicatePaths.get(parsed.id) ?? [exists.path];
    paths.push(parsed.path);
    duplicatePaths.set(parsed.id, paths);
  }

  const duplicates = Array.from(duplicatePaths.entries()).map(([id, paths]) => ({ id, paths }));
  return { byId, entities, duplicates };
}

export function resolveById(index: IdIndex, id: string): TlogIndexedEntity | undefined {
  return index.byId.get(id);
}

export function resolveRelated(index: IdIndex, source: Pick<TlogIndexedEntity, "related">): RelatedResolution {
  const resolved: TlogIndexedEntity[] = [];
  const missing: string[] = [];

  for (const id of source.related) {
    const entity = index.byId.get(id);
    if (entity) {
      resolved.push(entity);
    } else {
      missing.push(id);
    }
  }

  return { resolved, missing };
}

export function detectEntityType(path: string): TlogEntityType {
  const name = basename(path);
  if (name === "index.yaml" || name.endsWith(".suite.yaml")) {
    return "suite";
  }

  if (name.endsWith(".testcase.yaml")) {
    return "case";
  }

  return "case";
}
