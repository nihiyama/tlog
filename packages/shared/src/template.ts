import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Suite, TestCase } from "./domain.js";
import { buildDefaultCase, buildDefaultSuite } from "./builders.js";
import { readYamlFile } from "./yaml-io.js";
import { validateCase, validateSuite } from "./validation.js";

export interface TlogTemplate {
  suite: Partial<Suite>;
  testCase: Partial<TestCase>;
}

export function applyTemplateToSuite(base: Suite, template: TlogTemplate): Suite {
  return {
    ...base,
    ...template.suite,
    duration: template.suite.duration ?? base.duration
  };
}

export function applyTemplateToCase(base: TestCase, template: TlogTemplate): TestCase {
  return {
    ...base,
    ...template.testCase,
    tests: template.testCase.tests ?? base.tests,
    issues: template.testCase.issues ?? base.issues
  };
}

export function applyTemplate(
  suiteInput: { id: string; title: string },
  caseInput: { id: string; title: string },
  template?: TlogTemplate
): { suite: Suite; testCase: TestCase } {
  const baseSuite = buildDefaultSuite(suiteInput);
  const baseCase = buildDefaultCase(caseInput);

  if (!template) {
    return { suite: baseSuite, testCase: baseCase };
  }

  return {
    suite: applyTemplateToSuite(baseSuite, template),
    testCase: applyTemplateToCase(baseCase, template)
  };
}

export async function extractTemplateFromDirectory(rootDir: string): Promise<TlogTemplate> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const suiteFile = entries.find((entry) => entry.isFile() && entry.name === "index.yaml");
  const caseFile = entries.find((entry) => entry.isFile() && entry.name.endsWith(".yaml") && entry.name !== "index.yaml");

  const suite = suiteFile ? await readYamlFile<Partial<Suite>>(join(rootDir, suiteFile.name)) : {};
  const testCase = caseFile ? await readYamlFile<Partial<TestCase>>(join(rootDir, caseFile.name)) : {};

  return { suite, testCase };
}

export function validateTemplate(template: TlogTemplate): { valid: boolean; errors: string[] } {
  const suiteCandidate = buildDefaultSuite({ id: "template-suite", title: "Template Suite" });
  const caseCandidate = buildDefaultCase({ id: "template-case", title: "Template Case" });

  const suiteResult = validateSuite(applyTemplateToSuite(suiteCandidate, template));
  const caseResult = validateCase(applyTemplateToCase(caseCandidate, template));

  const errors = [...suiteResult.errors, ...caseResult.errors].map((error) => `${error.path}: ${error.message}`);
  return {
    valid: errors.length === 0,
    errors
  };
}
