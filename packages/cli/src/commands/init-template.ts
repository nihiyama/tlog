import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import {
  buildDefaultCase,
  buildDefaultSuite,
  parseYaml,
  stringifyYaml,
  validateTemplate,
  type Suite,
  type TestCase
} from "@tlog/shared";
import { CliError, emitSuccess, ensureDirectory, formatOf, type GlobalOptions } from "../core.js";

export interface InitOptions {
  output: string;
  template?: string;
}

export interface TemplateOptions {
  from?: string;
  output: string;
}

interface LocalTemplateData {
  suite: Partial<Suite>;
  testCase: Partial<TestCase>;
}

function normalizeTemplateCase(input: Partial<TestCase>): Partial<TestCase> {
  const issues = Array.isArray(input.issues)
    ? input.issues.map((issue) => {
      if (!issue || typeof issue !== "object") {
        return issue;
      }

      const source = issue as unknown as Record<string, unknown>;
      const normalized: Record<string, unknown> = { ...source };

      if (!("detectedDay" in normalized)) {
        normalized.detectedDay = null;
      }
        if (!("completedDay" in normalized)) {
          normalized.completedDay = null;
        }

        return normalized as unknown as (typeof input.issues)[number];
      }) as typeof input.issues
    : input.issues;

  return {
    ...input,
    issues
  };
}

function createDefaultTemplateData() {
  const suite = buildDefaultSuite({ id: "default", title: "Default Suite", description: "tlog test suite" });
  const testCase = buildDefaultCase({ id: "default-case", title: "Default Case", status: "todo" });
  return { suite, testCase };
}

function safePath(path: string): string {
  return normalize(path).split("\\").join("/");
}

function readTemplateDirectory(templateDir: string): LocalTemplateData {
  const indexPath = join(templateDir, "index.yaml");
  if (!existsSync(indexPath)) {
    throw new CliError("Template is missing required file", {
      details: [safePath(indexPath)]
    });
  }

  const template = {
    suite: parseYamlFile<Partial<Suite>>(indexPath),
    testCase: {} as Partial<TestCase>
  };

  const yamlFiles = readdirSync(templateDir).filter((name) => name.endsWith(".yaml") && name !== "index.yaml");
  if (yamlFiles.length > 0) {
    const firstCase = join(templateDir, yamlFiles[0]);
    template.testCase = normalizeTemplateCase(parseYamlFile<Partial<TestCase>>(firstCase));
  }

  return template;
}

function parseYamlFile<T>(path: string): T {
  const source = readFileSync(path, "utf8");
  return parseYaml<T>(source);
}

export function runInit(cwd: string, options: InitOptions, globalOptions: GlobalOptions): void {
  const format = formatOf(globalOptions);
  const outputDir = resolve(cwd, options.output);
  const indexPath = join(outputDir, "index.yaml");
  const casePath = join(outputDir, "default-case.testcase.yaml");

  const defaults = createDefaultTemplateData();
  let suite = defaults.suite;
  let testCase = defaults.testCase;

  if (options.template) {
    const templateDir = resolve(cwd, options.template);
    ensureDirectory(templateDir, "Template directory does not exist");

    const template = readTemplateDirectory(templateDir);
    const validation = validateTemplate(template);
    if (!validation.valid) {
      throw new CliError("Invalid template", { details: validation.errors });
    }

    suite = {
      ...suite,
      ...template.suite,
      duration: template.suite.duration ?? suite.duration
    };
    testCase = {
      ...testCase,
      ...template.testCase,
      tests: template.testCase.tests ?? testCase.tests,
      issues: template.testCase.issues ?? testCase.issues
    };
  }

  const alreadyExists = [indexPath, casePath].filter((path) => existsSync(path));
  if (alreadyExists.length > 0) {
    throw new CliError("Target files already exist", {
      details: alreadyExists.map((path) => safePath(path))
    });
  }

  const files = [
    { path: indexPath, content: stringifyYaml(suite) },
    { path: casePath, content: stringifyYaml(testCase) }
  ];

  if (!globalOptions.dryRun) {
    mkdirSync(outputDir, { recursive: true });
    for (const file of files) {
      writeFileSync(file.path, file.content, "utf8");
    }
  }

  emitSuccess(
    "init",
    {
      output: safePath(outputDir),
      dryRun: globalOptions.dryRun,
      files: files.map((file) => safePath(file.path))
    },
    format,
    [
      `Initialized: ${safePath(outputDir)}`,
      ...files.map((file) => `${globalOptions.dryRun ? "Would create" : "Created"}: ${safePath(file.path)}`)
    ]
  );
}

export function runTemplate(cwd: string, options: TemplateOptions, globalOptions: GlobalOptions): void {
  const format = formatOf(globalOptions);
  const outputDir = resolve(cwd, options.output);
  const indexPath = join(outputDir, "index.yaml");
  const casePath = join(outputDir, "sample.testcase.yaml");

  if (existsSync(indexPath) || existsSync(casePath)) {
    throw new CliError("Output already has template files", {
      details: [safePath(indexPath), safePath(casePath)].filter((path) => existsSync(path))
    });
  }

  let suite = buildDefaultSuite({ id: "template-suite", title: "Template Suite" });
  let testCase = buildDefaultCase({ id: "template-case", title: "Template Case" });

  if (options.from) {
    const sourceDir = resolve(cwd, options.from);
    ensureDirectory(sourceDir, "Source directory does not exist");

    const fromIndex = join(sourceDir, "index.yaml");
    if (!existsSync(fromIndex)) {
      throw new CliError("Source is missing required file", {
        details: [safePath(fromIndex)]
      });
    }

    const extracted = readTemplateDirectory(sourceDir);
    const validation = validateTemplate({ suite: extracted.suite, testCase: extracted.testCase });
    if (!validation.valid) {
      throw new CliError("Source template is invalid", { details: validation.errors });
    }

    suite = {
      ...suite,
      ...extracted.suite,
      duration: extracted.suite.duration ?? suite.duration
    };
    testCase = {
      ...testCase,
      ...extracted.testCase,
      tests: extracted.testCase.tests ?? testCase.tests,
      issues: extracted.testCase.issues ?? testCase.issues
    };
  }

  const files = [
    { path: indexPath, content: stringifyYaml(suite) },
    { path: casePath, content: stringifyYaml(testCase) }
  ];

  if (!globalOptions.dryRun) {
    mkdirSync(outputDir, { recursive: true });
    for (const file of files) {
      writeFileSync(file.path, file.content, "utf8");
    }
  }

  emitSuccess(
    "template",
    {
      output: safePath(outputDir),
      from: options.from ? safePath(resolve(cwd, options.from)) : null,
      dryRun: globalOptions.dryRun,
      files: files.map((file) => safePath(file.path))
    },
    format,
    [
      `${globalOptions.dryRun ? "Preview" : "Created"} template: ${safePath(outputDir)}`,
      ...files.map((file) => `${globalOptions.dryRun ? "Would create" : "Created"}: ${safePath(file.path)}`)
    ]
  );
}
