import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { stderr } from "node:process";
import { ensureUniqueSlug, slugifyTitle } from "@tlog/shared";
import { DEFAULT_DATE } from "./constants.js";
import type { LogLevel, PromptExtraction, ToolResult } from "./types.js";

export function logEvent(level: LogLevel, event: string, detail: Record<string, unknown>): void {
  stderr.write(`${JSON.stringify({ level, event, at: new Date().toISOString(), ...detail })}\n`);
}

export function toToolResult(payload: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload
  };
}

export function toToolError(message: string, code: string, details: Record<string, unknown> = {}): ToolResult {
  const causeText = typeof details.cause === "string" ? details.cause : "";
  let resolvedCode = code;
  if (causeText.includes("validation:")) {
    resolvedCode = "validation";
  } else if (causeText.includes("security:")) {
    resolvedCode = "security";
  } else if (causeText.includes("conflict:")) {
    resolvedCode = "conflict";
  } else if (code === "missing_required_context") {
    resolvedCode = "missing_required_context";
  }

  return {
    content: [{ type: "text", text: message }],
    structuredContent: {
      error: {
        code: resolvedCode,
        message,
        details
      }
    },
    isError: true
  };
}

export function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return input as Record<string, unknown>;
}

export function extractPromptMetadata(instruction: string, prefix: "suite" | "case"): PromptExtraction {
  const warnings: string[] = [];
  const idMatch = instruction.match(/\bid\s*[:=]\s*([a-zA-Z0-9._-]+)/i);
  const titleMatch = instruction.match(/\btitle\s*[:=]\s*([^\n;]+)/i);

  let id = idMatch?.[1]?.trim() ?? "";
  let title = titleMatch?.[1]?.trim() ?? "";

  if (!id) {
    id = `${prefix}-${slugifyTitle(title)}`;
    warnings.push("id was inferred from title");
  }

  if (!title) {
    if (id) {
      title = id;
      warnings.push("title was inferred from id");
    } else {
      const firstSentence = instruction.split(/[\n。.!?]/)[0]?.trim() ?? "";
      title = firstSentence.length > 0 ? firstSentence.slice(0, 64) : `${prefix} generated ${DEFAULT_DATE}`;
      warnings.push("title was inferred from instruction");
    }
  }

  return { id, title, warnings };
}

export function resolvePathInsideWorkspace(workspaceRoot: string, targetPath: string): string {
  const root = resolve(workspaceRoot);
  const resolvedPath = resolve(root, targetPath);
  const rel = relative(root, resolvedPath);

  if (rel.startsWith("..") || rel.includes(`..${sep}`)) {
    throw new Error(`security: path outside workspace is not allowed (${targetPath})`);
  }

  return resolvedPath;
}

export function toRelativePath(workspaceRoot: string, absolutePath: string): string {
  return relative(resolve(workspaceRoot), absolutePath).split(sep).join("/");
}

export function assertNoOverwrite(path: string): void {
  if (existsSync(path)) {
    throw new Error(`conflict: target file already exists (${path})`);
  }
}

export async function listYamlFiles(rootDir: string): Promise<string[]> {
  const queue: string[] = [rootDir];
  const files: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(path);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".yaml")) {
        files.push(path);
      }
    }
  }

  return files;
}

export function summarizeDiff(before: unknown, after: unknown): string[] {
  const beforeObj = asObject(before);
  const afterObj = asObject(after);
  const keys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
  const changes: string[] = [];

  for (const key of keys) {
    const beforeVal = JSON.stringify(beforeObj[key]);
    const afterVal = JSON.stringify(afterObj[key]);
    if (beforeVal !== afterVal) {
      changes.push(`${key} changed`);
    }
  }

  return changes.length > 0 ? changes : ["no structural changes"];
}

export function selectAppliedMode(mode: "replace" | "append" | "auto", instruction: string): "replace" | "append" {
  if (mode === "replace" || mode === "append") {
    return mode;
  }

  const lowered = instruction.toLowerCase();
  if (lowered.includes("replace") || lowered.includes("置換") || lowered.includes("入れ替")) {
    return "replace";
  }

  return "append";
}

export function findAvailablePath(basePath: string): string {
  if (!existsSync(basePath)) {
    return basePath;
  }

  const used = new Set<string>();
  const ext = basePath.endsWith(".yaml") ? ".yaml" : "";
  const stem = ext ? basePath.slice(0, -ext.length) : basePath;

  used.add(basename(stem));
  const nextSlug = ensureUniqueSlug(basename(stem), used);
  return join(dirname(basePath), `${nextSlug}${ext}`);
}
