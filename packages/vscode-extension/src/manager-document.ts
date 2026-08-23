import { parseYaml, stringifyYaml } from "@tlog/shared";
import type { Suite, TestCase } from "@tlog/shared";
import { splitCsv } from "./string-utils.js";

function splitDraftLines(value: string): string[] {
  if (value.length === 0) {
    return [];
  }
  return value.split(/\r?\n/).filter((line) => line.length > 0);
}

export interface ManagerRelatedOption {
  ref: string;
  id: string;
}

export interface EditSuiteMessage {
  type: "editSuite";
  path: string;
  id: string;
  title: string;
  description: string;
  tags: string;
  owners: string;
  scoped: boolean;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string;
  actualEnd: string;
  related: string;
  remarks: string;
}

export interface EditCaseMessage {
  type: "editCase";
  path: string;
  id: string;
  title: string;
  description: string;
  tags: string;
  owners: string;
  scoped: boolean;
  status: "todo" | "doing" | "done" | null;
  operations: string[];
  related: string;
  remarks: string;
  completedDay: string;
  tests: TestCase["tests"];
  issues: TestCase["issues"];
}

export type ManagerEditMessage = EditSuiteMessage | EditCaseMessage;

export function normalizeManagerRelatedRefs(rawValues: string[], options: ManagerRelatedOption[]): string[] {
  const byRef = new Map<string, string>();
  for (const option of options) {
    byRef.set(option.ref, option.id);
    byRef.set(option.id, option.id);
  }

  return Array.from(
    new Set(
      rawValues
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .map((value) => byRef.get(value) ?? value)
    )
  );
}

export function applyManagerEdit(
  source: string,
  message: ManagerEditMessage,
  relatedOptions: ManagerRelatedOption[]
): string {
  const normalizedRelated = normalizeManagerRelatedRefs(splitCsv(message.related), relatedOptions);

  if (message.type === "editSuite") {
    const current = parseYaml<Suite>(source);
    const updated: Suite = {
      ...current,
      title: message.title,
      description: message.description,
      tags: splitCsv(message.tags),
      owners: splitCsv(message.owners),
      scoped: message.scoped,
      duration: {
        scheduled: {
          start: message.scheduledStart as Suite["duration"]["scheduled"]["start"],
          end: message.scheduledEnd as Suite["duration"]["scheduled"]["end"]
        },
        actual: {
          start: message.actualStart as Suite["duration"]["actual"]["start"],
          end: message.actualEnd as Suite["duration"]["actual"]["end"]
        }
      },
      related: normalizedRelated,
      remarks: splitDraftLines(message.remarks)
    };
    return stringifyYaml(updated);
  }

  const current = parseYaml<TestCase>(source);
  const updated: TestCase = {
    id: current.id,
    title: message.title,
    tags: splitCsv(message.tags),
    owners: splitCsv(message.owners),
    description: message.description,
    scoped: message.scoped,
    status: message.status,
    operations: message.operations,
    related: normalizedRelated,
    remarks: splitDraftLines(message.remarks),
    completedDay:
      message.completedDay.trim().length > 0 ? (message.completedDay as TestCase["completedDay"]) : null,
    tests: message.tests,
    issues: message.issues.map((issue) => ({
      ...issue,
      owners: Array.isArray(issue.owners) ? issue.owners : [],
      related: normalizeManagerRelatedRefs(issue.related ?? [], relatedOptions),
      remarks: issue.remarks ?? []
    }))
  };
  return stringifyYaml(updated);
}

export function getManagerDocumentRelated(source: string, path: string): { id: string; related: string[] } {
  const parsed = parseYaml<Suite | TestCase>(source);
  if (!path.endsWith(".yaml")) {
    throw new Error(`Unsupported TLog document: ${path}`);
  }
  return { id: parsed.id, related: parsed.related ?? [] };
}
