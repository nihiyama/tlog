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

  it("suite/case create rejects invalid id format", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-id-format-"));

    const badSuite = runInDir(dir, ["suite", "create", "--id", "bad id", "--title", "Bad"]);
    expect(badSuite.exitCode).toBe(1);
    expect(badSuite.stderr).toContain("Invalid suite id: bad id");

    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);
    const suiteDir = join(dir, "tests", "suite-a");
    const badCase = runInDir(dir, [
      "case",
      "create",
      "--suite-dir",
      suiteDir,
      "--id",
      "bad/id",
      "--title",
      "Bad Case"
    ]);
    expect(badCase.exitCode).toBe(1);
    expect(badCase.stderr).toContain("Invalid case id: bad/id");
  });

  it("case create creates yaml and supports status", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-case-"));

    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);
    const suiteDir = join(dir, "tests", "suite-a");

    const result = runInDir(dir, [
      "case",
      "create",
      "--suite-dir",
      suiteDir,
      "--id",
      "case-1",
      "--title",
      "Login Success",
      "--owners",
      "qa-team",
      "--status",
      "doing"
    ]);

    expect(result.exitCode).toBe(0);
    const file = readFileSync(join(suiteDir, "case-1.testcase.yaml"), "utf8");
    expect(file).toContain("id: case-1");
    expect(file).toContain("- qa-team");
    expect(file).toContain("status: doing");
  });

  it("suite update updates only specified fields", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-suite-update-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);

    const result = runInDir(dir, [
      "suite",
      "update",
      "--dir",
      "tests",
      "--id",
      "suite-a",
      "--description",
      "updated",
      "--owners",
      "qa,dev",
      "--json"
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"ok": true');
    const suitePath = join(dir, "tests", "suite-a", "index.yaml");
    const suiteRaw = readFileSync(suitePath, "utf8");
    expect(suiteRaw).toContain("title: Suite A");
    expect(suiteRaw).toContain("description: updated");
    expect(suiteRaw).toContain("- qa");
    expect(suiteRaw).toContain("- dev");
  });

  it("case update updates issues via JSON file with detectedDay/completedDay", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-case-update-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);
    const suiteDir = join(dir, "tests", "suite-a");
    runInDir(dir, ["case", "create", "--suite-dir", suiteDir, "--id", "case-a", "--title", "Case A"]);

    const issuesFile = join(dir, "issues.json");
    writeFileSync(
      issuesFile,
      JSON.stringify(
        [
          {
            incident: "incident-a",
            owners: ["qa"],
            causes: ["cause-a"],
            solutions: ["fix-a"],
            status: "open",
            detectedDay: "2026-02-20",
            completedDay: null,
            related: [],
            remarks: []
          }
        ],
        null,
        2
      ),
      "utf8"
    );

    const result = runInDir(dir, [
      "case",
      "update",
      "--dir",
      "tests",
      "--id",
      "case-a",
      "--owners",
      "qa,ops",
      "--issues-file",
      issuesFile,
      "--json"
    ]);
    expect(result.exitCode).toBe(0);
    const caseRaw = readFileSync(join(suiteDir, "case-a.testcase.yaml"), "utf8");
    expect(caseRaw).toContain("owners:");
    expect(caseRaw).toContain("- qa");
    expect(caseRaw).toContain("- ops");
    expect(caseRaw).toContain("incident: incident-a");
    expect(caseRaw).toContain("    owners:");
    expect(caseRaw).toContain("detectedDay: 2026-02-20");
    expect(caseRaw).toContain("completedDay: null");
  });

  it("case update fails validation and keeps file unchanged", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-case-update-fail-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);
    const suiteDir = join(dir, "tests", "suite-a");
    runInDir(dir, ["case", "create", "--suite-dir", suiteDir, "--id", "case-a", "--title", "Case A"]);
    const casePath = join(suiteDir, "case-a.testcase.yaml");
    const before = readFileSync(casePath, "utf8");

    const issuesFile = join(dir, "bad-issues.json");
    writeFileSync(
      issuesFile,
      JSON.stringify(
        [
          {
            incident: "incident-a",
            owners: [],
            causes: [],
            solutions: [],
            status: "open",
            completedDay: null,
            related: [],
            remarks: []
          }
        ],
        null,
        2
      ),
      "utf8"
    );

    const result = runInDir(dir, ["case", "update", "--dir", "tests", "--id", "case-a", "--issues-file", issuesFile]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Case update validation failed");
    const after = readFileSync(casePath, "utf8");
    expect(after).toBe(before);
  });

  it("suite/case update rejects invalid scoped option", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-update-scoped-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);
    const suiteDir = join(dir, "tests", "suite-a");
    runInDir(dir, ["case", "create", "--suite-dir", suiteDir, "--id", "case-a", "--title", "Case A"]);

    const suiteResult = runInDir(dir, ["suite", "update", "--dir", "tests", "--id", "suite-a", "--scoped", "maybe"]);
    expect(suiteResult.exitCode).toBe(1);
    expect(suiteResult.stderr).toContain("Invalid scoped: maybe");

    const caseResult = runInDir(dir, ["case", "update", "--dir", "tests", "--id", "case-a", "--scoped", "maybe"]);
    expect(caseResult.exitCode).toBe(1);
    expect(caseResult.stderr).toContain("Invalid scoped: maybe");
  });

  it("case update rejects invalid tests/issues JSON inputs", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-update-json-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);
    const suiteDir = join(dir, "tests", "suite-a");
    runInDir(dir, ["case", "create", "--suite-dir", suiteDir, "--id", "case-a", "--title", "Case A"]);

    const missing = runInDir(dir, ["case", "update", "--dir", "tests", "--id", "case-a", "--tests-file", "missing.json"]);
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toContain("tests file not found");

    const notArrayPath = join(dir, "not-array.json");
    writeFileSync(notArrayPath, JSON.stringify({ k: 1 }), "utf8");
    const notArray = runInDir(dir, ["case", "update", "--dir", "tests", "--id", "case-a", "--tests-file", notArrayPath]);
    expect(notArray.exitCode).toBe(1);
    expect(notArray.stderr).toContain("tests must be an array");

    const invalidJsonPath = join(dir, "invalid.json");
    writeFileSync(invalidJsonPath, "{broken", "utf8");
    const invalid = runInDir(dir, ["case", "update", "--dir", "tests", "--id", "case-a", "--issues-file", invalidJsonPath]);
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toContain("Invalid issues JSON");
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

  it("validate --watch is disabled in CI", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-validate-watch-ci-"));
    const testsDir = join(dir, "tests");
    mkdirSync(testsDir, { recursive: true });
    writeFileSync(join(testsDir, "index.yaml"), "id: s1\ntitle: S1\ntags: []\ndescription: ''\nscoped: true\nowners: []\nduration:\n  scheduled:\n    start: 2025-01-01\n    end: 2025-01-01\n  actual:\n    start: 2025-01-01\n    end: 2025-01-01\nrelated: []\nremarks: []\n", "utf8");

    const previousCi = process.env.CI;
    process.env.CI = "true";
    try {
      const result = runInDir(dir, ["validate", "--dir", "tests", "--watch"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Watch mode is disabled in CI environment.");
    } finally {
      if (previousCi === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = previousCi;
      }
    }
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
    const suiteDir = join(dir, "tests", "suite-a");
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

  it("case list supports owners/scoped/issue filters with AND condition", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-case-filters-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A", "--owners", "qa-team"]);
    const suiteDir = join(dir, "tests", "suite-a");

    writeFileSync(
      join(suiteDir, "hit.testcase.yaml"),
      [
        "id: hit",
        "title: hit",
        "tags: [smoke]",
        "description: ''",
        "scoped: true",
        "status: todo",
        "operations: []",
        "related: []",
        "remarks: []",
        "completedDay: null",
        "tests: []",
        "issues:",
        "  - incident: login API timeout",
        "    owners: [ops]",
        "    causes: [network]",
        "    solutions: [retry]",
        "    status: open",
        "    detectedDay: null",
        "    completedDay: null",
        "    related: []",
        "    remarks: [urgent]"
      ].join("\n"),
      "utf8"
    );
    writeFileSync(
      join(suiteDir, "miss.testcase.yaml"),
      [
        "id: miss",
        "title: miss",
        "tags: [smoke]",
        "description: ''",
        "scoped: false",
        "status: todo",
        "operations: []",
        "related: []",
        "remarks: []",
        "completedDay: null",
        "tests: []",
        "issues:",
        "  - incident: unrelated",
        "    owners: []",
        "    causes: []",
        "    solutions: []",
        "    status: resolved",
        "    detectedDay: null",
        "    completedDay: null",
        "    related: []",
        "    remarks: []"
      ].join("\n"),
      "utf8"
    );

    const result = runInDir(dir, [
      "case",
      "list",
      "--dir",
      "tests",
      "--owners",
      "qa-team",
      "--scoped-only",
      "--issue-has",
      "timeout",
      "--issue-status",
      "open",
      "--json"
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"id": "hit"');
    expect(result.stdout).not.toContain('"id": "miss"');
  });

  it("case list rejects invalid issue status filter", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-case-issue-status-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);

    const result = runInDir(dir, ["case", "list", "--dir", "tests", "--issue-status", "closed"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Invalid issue status: closed");
  });

  it("list commands support csv format", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-list-csv-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);

    const suiteCsv = runInDir(dir, ["suite", "list", "--dir", "tests", "--format", "csv"]);
    expect(suiteCsv.exitCode).toBe(0);
    expect(suiteCsv.stdout).toContain("id,path");
    expect(suiteCsv.stdout).toContain("suite-a,tests/suite-a/index.yaml");
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

  it("related sync fills missing reciprocal link", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-related-sync-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);
    runInDir(dir, ["suite", "create", "--id", "suite-b", "--title", "Suite B"]);
    const suiteAPath = join(dir, "tests", "suite-a", "index.yaml");
    const suiteBPath = join(dir, "tests", "suite-b", "index.yaml");
    const suiteAWithRelated = `${readFileSync(suiteAPath, "utf8").replace("related: []", "related:\n  - suite-b")}`;
    writeFileSync(suiteAPath, suiteAWithRelated, "utf8");

    const result = runInDir(dir, ["related", "sync", "--dir", "tests"]);
    expect(result.exitCode).toBe(0);
    const suiteBRaw = readFileSync(suiteBPath, "utf8");
    expect(suiteBRaw).toContain("- suite-a");
  });

  it("related sync reports unresolved ids", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-related-unresolved-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);
    const suiteAPath = join(dir, "tests", "suite-a", "index.yaml");
    const suiteAWithRelated = `${readFileSync(suiteAPath, "utf8").replace("related: []", "related:\n  - missing-id")}`;
    writeFileSync(suiteAPath, suiteAWithRelated, "utf8");

    const result = runInDir(dir, ["related", "sync", "--dir", "tests", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"sourceId": "suite-a"');
    expect(result.stdout).toContain('"targetId": "missing-id"');
  });

  it("related sync supports --id target and dry-run", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-related-id-dryrun-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);
    runInDir(dir, ["suite", "create", "--id", "suite-b", "--title", "Suite B"]);
    const suiteAPath = join(dir, "tests", "suite-a", "index.yaml");
    writeFileSync(suiteAPath, readFileSync(suiteAPath, "utf8").replace("related: []", "related:\n  - suite-b"), "utf8");

    const dryRun = runInDir(dir, ["related", "sync", "--dir", "tests", "--id", "suite-a", "--dry-run"]);
    expect(dryRun.exitCode).toBe(0);
    expect(dryRun.stdout).toContain("Would sync");
    const suiteBRaw = readFileSync(join(dir, "tests", "suite-b", "index.yaml"), "utf8");
    expect(suiteBRaw).toContain("related: []");
  });

  it("related sync/list fails for unknown id", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-related-missing-id-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);

    const sync = runInDir(dir, ["related", "sync", "--dir", "tests", "--id", "unknown"]);
    expect(sync.exitCode).toBe(1);
    expect(sync.stderr).toContain("id not found: unknown");

    const list = runInDir(dir, ["related", "list", "--dir", "tests", "--id", "unknown"]);
    expect(list.exitCode).toBe(1);
    expect(list.stderr).toContain("id not found: unknown");
  });

  it("related sync fails when duplicate ids exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-related-duplicate-id-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);
    runInDir(dir, ["suite", "create", "--id", "suite-b", "--title", "Suite B"]);
    const suiteBPath = join(dir, "tests", "suite-b", "index.yaml");
    const duplicated = readFileSync(suiteBPath, "utf8").replace("id: suite-b", "id: suite-a");
    writeFileSync(suiteBPath, duplicated, "utf8");

    const result = runInDir(dir, ["related", "sync", "--dir", "tests"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Duplicate ids found");
  });

  it("related list separates resolved and unresolved items", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-related-list-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);
    runInDir(dir, ["suite", "create", "--id", "suite-b", "--title", "Suite B"]);
    const suiteAPath = join(dir, "tests", "suite-a", "index.yaml");
    const suiteAWithRelated = `${readFileSync(suiteAPath, "utf8").replace("related: []", "related:\n  - suite-b\n  - missing-id")}`;
    writeFileSync(suiteAPath, suiteAWithRelated, "utf8");

    const json = runInDir(dir, ["related", "list", "--dir", "tests", "--id", "suite-a", "--json"]);
    expect(json.exitCode).toBe(0);
    expect(json.stdout).toContain('"resolved"');
    expect(json.stdout).toContain('"id": "suite-b"');
    expect(json.stdout).toContain('"unresolved"');
    expect(json.stdout).toContain('"missing-id"');

    const csv = runInDir(dir, ["related", "list", "--dir", "tests", "--id", "suite-a", "--format", "csv"]);
    expect(csv.exitCode).toBe(0);
    expect(csv.stdout).toContain("status,type,id,path");
    expect(csv.stdout).toContain("resolved,suite,suite-b");
    expect(csv.stdout).toContain("unresolved,-,missing-id,-");
  });

  it("suite delete moves suite directory to trash", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-suite-delete-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);

    const result = runInDir(dir, ["suite", "delete", "--dir", "tests", "--id", "suite-a", "--yes", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"ok": true');
    const listResult = runInDir(dir, ["suite", "list", "--dir", "tests", "--json"]);
    expect(listResult.stdout).not.toContain('"id": "suite-a"');
    const trashList = runInDir(dir, ["suite", "list", "--dir", ".tlog-trash", "--json"]);
    expect(trashList.stdout).toContain("suite-a");
  });

  it("case delete supports dry-run", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-case-delete-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);
    const suiteDir = join(dir, "tests", "suite-a");
    runInDir(dir, ["case", "create", "--suite-dir", suiteDir, "--id", "case-a", "--title", "Case A"]);
    const casePath = join(suiteDir, "case-a.testcase.yaml");

    const result = runInDir(dir, ["case", "delete", "--dir", "tests", "--id", "case-a", "--yes", "--dry-run"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Would delete");
    expect(readFileSync(casePath, "utf8")).toContain("id: case-a");
  });

  it("delete without --yes is cancelled in non-interactive mode", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-delete-cancel-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);

    const suiteDelete = runInDir(dir, ["suite", "delete", "--dir", "tests", "--id", "suite-a"]);
    expect(suiteDelete.exitCode).toBe(1);
    expect(suiteDelete.stderr).toContain("Delete cancelled");
  });

  it("suite stats shows status and duration stats", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-suite-stats-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);
    const suiteDir = join(dir, "tests", "suite-a");
    runInDir(dir, ["case", "create", "--suite-dir", suiteDir, "--id", "case-a", "--title", "Case A", "--status", "todo"]);
    runInDir(dir, ["case", "create", "--suite-dir", suiteDir, "--id", "case-b", "--title", "Case B", "--status", "done"]);

    const text = runInDir(dir, ["suite", "stats", "--dir", "tests", "--id", "suite-a"]);
    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain("suite=suite-a");
    expect(text.stdout).toContain("todo=1");
    expect(text.stdout).toContain("done=1");

    const json = runInDir(dir, ["suite", "stats", "--dir", "tests", "--id", "suite-a", "--json"]);
    expect(json.exitCode).toBe(0);
    expect(json.stdout).toContain('"statusCounts"');
    expect(json.stdout).toContain('"todo": 1');
    expect(json.stdout).toContain('"done": 1');
  });

  it("suite stats burndown counts only suite scoped=true and case scoped=true", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-suite-scoped-stats-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);
    runInDir(dir, ["suite", "update", "--dir", "tests", "--id", "suite-a", "--scoped", "false"]);
    const suiteDir = join(dir, "tests", "suite-a");
    runInDir(dir, ["case", "create", "--suite-dir", suiteDir, "--id", "case-a", "--title", "Case A", "--status", "done"]);

    const json = runInDir(dir, ["suite", "stats", "--dir", "tests", "--id", "suite-a", "--json"]);
    expect(json.exitCode).toBe(0);
    expect(json.stdout).toContain('"statusCounts"');
    expect(json.stdout).toContain('"total": 0');
    expect(json.stdout).toContain('"no_target_cases"');
  });

  it("list stdout text aligns columns", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-list-align-"));
    runInDir(dir, ["suite", "create", "--id", "suite-a", "--title", "Suite A"]);
    const suiteDir = join(dir, "tests", "suite-a");
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
