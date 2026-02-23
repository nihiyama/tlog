import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runInDir(dir: string, args: string[]): RunResult {
  const originalCwd = process.cwd();
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    stdoutChunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write);
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(((chunk: string | Uint8Array) => {
    stderrChunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write);

  try {
    process.chdir(dir);
    runCli(["node", "tlog", ...args]);
  } finally {
    process.chdir(originalCwd);
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }

  return {
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join(""),
    exitCode: process.exitCode ?? 0
  };
}

afterEach(() => {
  process.exitCode = 0;
});

describe("tlog cli", () => {
  it("init creates tests directory with default files", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-init-"));

    const result = runInDir(dir, ["init"]);

    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(dir, "tests", "index.yaml"), "utf8")).toContain("id: default");
    expect(readFileSync(join(dir, "tests", "default-case.testcase.yaml"), "utf8")).toContain("id: default-case");
  });

  it("init --template fails when template has no index.yaml", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-init-template-"));
    const templateDir = join(dir, "template");
    mkdirSync(templateDir, { recursive: true });

    const result = runInDir(dir, ["init", "--template", "template"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Template is missing required file");
  });

  it("template creates skeleton files", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-template-"));

    const result = runInDir(dir, ["template", "--output", "templates/base"]);

    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(dir, "templates", "base", "index.yaml"), "utf8")).toContain("id: template-suite");
    expect(readFileSync(join(dir, "templates", "base", "sample.testcase.yaml"), "utf8")).toContain("id: template-case");
  });

  it("template --from rejects legacy issue schema", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-template-legacy-"));
    const sourceDir = join(dir, "legacy");
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(
      join(sourceDir, "index.yaml"),
      "id: s1\ntitle: S1\ntags: []\ndescription: ''\nscoped: true\nowners: []\nduration:\n  scheduled:\n    start: 2025-01-01\n    end: 2025-01-01\n  actual:\n    start: 2025-01-01\n    end: 2025-01-01\nrelated: []\nremarks: []\n",
      "utf8"
    );
    writeFileSync(
      join(sourceDir, "legacy.testcase.yaml"),
      "id: c1\ntitle: C1\ntags: []\ndescription: ''\nscoped: true\nstatus: todo\noperations: []\nrelated: []\nremarks: []\ncompletedDay: null\ntests: []\nissues:\n  - incident: i1\n    owners: []\n    cause: []\n    solution: []\n    status: open\n    completedAt: 2025-01-02\n    related: []\n    remarks: []\n",
      "utf8"
    );

    const result = runInDir(dir, ["template", "--from", "legacy", "--output", "templates/migrated"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Source template is invalid");
  });

  it("suite create blocks duplicated id", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-suite-"));

    const first = runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);
    const second = runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A 2"]);

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(1);
    expect(second.stderr).toContain("ID already exists: suite-a");
  });

  it("case create creates yaml and supports status", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-case-"));

    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);
    const suiteDir = join(dir, "tests", "suite-a-suite-a");

    const result = runInDir(dir, [
      "case",
      "create",
      "--suite-dir",
      suiteDir,
      "--id",
      "case-1",
      "--title",
      "Login Success",
      "--status",
      "doing"
    ]);

    expect(result.exitCode).toBe(0);
    const file = readFileSync(join(suiteDir, "case-1-login-success.testcase.yaml"), "utf8");
    expect(file).toContain("id: case-1");
    expect(file).toContain("status: doing");
  });

  it("validate detects broken yaml and returns non-zero", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-validate-"));
    const testsDir = join(dir, "tests");
    mkdirSync(testsDir, { recursive: true });
    writeFileSync(join(testsDir, "index.yaml"), "id: [broken", "utf8");

    const result = runInDir(dir, ["validate", "--dir", "tests"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Validation failed");
  });

  it("list templates returns json", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-list-templates-"));
    mkdirSync(join(dir, "templates", "a"), { recursive: true });
    writeFileSync(join(dir, "templates", "a", "index.yaml"), "id: a\ntitle: A\ntags: []\ndescription: ''\nscoped: true\nowners: []\nduration:\n  scheduled:\n    start: 2025-01-01\n    end: 2025-01-01\n  actual:\n    start: 2025-01-01\n    end: 2025-01-01\nrelated: []\nremarks: []\n", "utf8");

    const result = runInDir(dir, ["list", "templates", "--dir", "templates", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"ok": true');
    expect(result.stdout).toContain('"name": "a"');
  });

  it("suite list / case list supports json output and filters", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-lists-"));

    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);
    const suiteDir = join(dir, "tests", "suite-a-suite-a");
    runInDir(dir, [
      "case",
      "create",
      "--suite-dir",
      suiteDir,
      "--id",
      "case-a",
      "--title",
      "Case A",
      "--tags",
      "smoke",
      "--status",
      "todo"
    ]);

    const suiteList = runInDir(dir, ["suite", "list", "--dir", "tests", "--json"]);
    const caseList = runInDir(dir, ["case", "list", "--dir", "tests", "--tag", "smoke", "--json"]);

    expect(suiteList.exitCode).toBe(0);
    expect(suiteList.stdout).toContain('"id": "suite-a"');

    expect(caseList.exitCode).toBe(0);
    expect(caseList.stdout).toContain('"id": "case-a"');
    expect(caseList.stdout).toContain('"status": "todo"');
  });

  it("list commands support csv format", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-list-csv-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);

    const suiteCsv = runInDir(dir, ["suite", "list", "--dir", "tests", "--format", "csv"]);
    expect(suiteCsv.exitCode).toBe(0);
    expect(suiteCsv.stdout).toContain("id,path");
    expect(suiteCsv.stdout).toContain("suite-a,tests/suite-a-suite-a/index.yaml");
  });

  it("list commands support --output", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-list-output-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);

    const outFile = join(dir, "out", "suite-list.csv");
    const result = runInDir(dir, ["suite", "list", "--dir", "tests", "--format", "csv", "--output", outFile]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Wrote:");
    expect(readFileSync(outFile, "utf8")).toContain("id,path");
  });

  it("list stdout text aligns columns", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-list-align-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);
    const suiteDir = join(dir, "tests", "suite-a-suite-a");
    runInDir(dir, [
      "case",
      "create",
      "--suite-dir",
      suiteDir,
      "--id",
      "short",
      "--title",
      "Short",
      "--status",
      "todo"
    ]);
    runInDir(dir, [
      "case",
      "create",
      "--suite-dir",
      suiteDir,
      "--id",
      "very-long-case-id",
      "--title",
      "Long",
      "--status",
      "done"
    ]);

    const result = runInDir(dir, ["case", "list", "--dir", "tests"]);
    const lines = result.stdout
      .trim()
      .split("\n")
      .filter((line) => line.includes(".testcase.yaml"));

    expect(lines.length).toBe(2);
    const firstPathStart = lines[0].indexOf("tests/");
    const secondPathStart = lines[1].indexOf("tests/");
    expect(firstPathStart).toBeGreaterThan(0);
    expect(firstPathStart).toBe(secondPathStart);
  });
});
