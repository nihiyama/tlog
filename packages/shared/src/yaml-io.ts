import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseDocument, stringify } from "yaml";

export class TlogYamlParseError extends Error {
  public readonly line: number;
  public readonly column: number;

  constructor(message: string, line: number, column: number) {
    super(message);
    this.name = "TlogYamlParseError";
    this.line = line;
    this.column = column;
  }
}

export function parseYaml<T>(source: string): T {
  const document = parseDocument(source, { prettyErrors: false });
  const parseError = document.errors[0];

  if (parseError) {
    const linePos = parseError.linePos?.[0];
    const line = linePos?.line ?? 1;
    const column = linePos?.col ?? 1;
    throw new TlogYamlParseError(parseError.message, line, column);
  }

  return document.toJS() as T;
}

export function stringifyYaml(value: unknown): string {
  return stringify(value, {
    lineWidth: 0
  });
}

export async function readYamlFile<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return parseYaml<T>(raw);
}

export async function writeYamlFileAtomic(path: string, value: unknown): Promise<void> {
  const content = stringifyYaml(value);
  const parent = dirname(path);
  await mkdir(parent, { recursive: true });

  const tempPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, path);
}
