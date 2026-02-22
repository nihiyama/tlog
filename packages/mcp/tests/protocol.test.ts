import { mkdtemp, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  __internal,
  createCaseFileCore,
  createMcpServer,
  createSuiteFromPromptCore,
  hasStdioFlag,
  initTestsDirectoryCore,
  listCasesCore,
  listSuitesCore,
  organizeExecutionTargetsCore,
  resolveEntityPathByIdCore,
  validateTestsDirectoryCore
} from "../src/index.js";

describe("MCP server", () => {
  it("creates server instance", () => {
    const server = createMcpServer();
    expect(server).toBeTruthy();
  });

  it("exposes expected server identity constants", () => {
    expect(MCP_SERVER_NAME).toBe("tlog-mcp");
    expect(MCP_SERVER_VERSION).toBe("0.1.0");
  });
});

describe("hasStdioFlag", () => {
  it("returns true when --stdio is passed", () => {
    expect(hasStdioFlag(["--stdio"])).toBe(true);
  });

  it("returns false when --stdio is missing", () => {
    expect(hasStdioFlag([])).toBe(false);
  });
});

describe("core tools", () => {
  it("create_suite_from_prompt supports dry-run", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    const result = await createSuiteFromPromptCore({
      workspaceRoot: workspace,
      targetDir: "tests",
      instruction: "title: Login test suite",
      write: false
    });

    expect(result.writtenFile).toBeNull();
    expect(result.yamlText).toContain("title: Login test suite");
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("guards workspace boundary", () => {
    expect(() => __internal.resolvePathInsideWorkspace("/tmp/work", "../../etc/passwd")).toThrow(/security/);
  });

  it("normalizes testcase enum values and removes unknown fields", () => {
    const normalized = __internal.normalizeCaseCandidate({
      id: "c1",
      title: "Case 1",
      status: "DOING",
      extraField: "drop-this"
    });

    expect(normalized.entity.status).toBe("doing");
    expect(normalized.warnings.some((w) => w.includes("unknown testcase field removed: extraField"))).toBe(true);
  });

  it("normalizes issues completedAt to completedDay and accepts null completedDay", () => {
    const normalized = __internal.normalizeCaseCandidate({
      id: "c2",
      title: "Case 2",
      completedDay: null,
      issues: [
        {
          incident: "legacy issue",
          owners: [],
          cause: [],
          solution: [],
          status: "open",
          completedAt: "2026-02-20",
          related: [],
          remarks: []
        }
      ]
    });

    expect(normalized.entity.completedDay).toBeNull();
    expect(normalized.entity.issues[0]?.completedDay).toBe("2026-02-20");
    expect(
      normalized.warnings.some((w) => w.includes("issues[0].completedAt was normalized to completedDay"))
    ).toBe(true);
  });

  it("init and validate tests directory", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    await initTestsDirectoryCore({ workspaceRoot: workspace, outputDir: "tests", write: true });

    const validation = await validateTestsDirectoryCore({ workspaceRoot: workspace, dir: "tests" });
    const summary = validation.summary as { errorFiles: number };
    expect(summary.errorFiles).toBe(0);
  });

  it("lists suites without status and cases with status", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    await initTestsDirectoryCore({ workspaceRoot: workspace, outputDir: "tests", write: true });

    const suites = await listSuitesCore({ workspaceRoot: workspace, dir: "tests" });
    const cases = await listCasesCore({ workspaceRoot: workspace, dir: "tests" });

    expect((suites.suites as Array<Record<string, unknown>>)[0]).not.toHaveProperty("status");
    expect((cases.cases as Array<Record<string, unknown>>)[0]).toHaveProperty("status");
  });

  it("supports id based resolution after file rename", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    await mkdir(join(workspace, "tests"), { recursive: true });

    const created = await createCaseFileCore({
      workspaceRoot: workspace,
      dir: "tests",
      id: "case-stable-id",
      title: "Payment Flow",
      write: true
    });

    const originalPath = join(workspace, created.writtenFile as string);
    const renamedPath = join(workspace, "tests", "manually-renamed.testcase.yaml");
    await rename(originalPath, renamedPath);

    const resolved = await resolveEntityPathByIdCore({
      workspaceRoot: workspace,
      dir: "tests",
      id: "case-stable-id"
    });

    const found = resolved.found as { path: string };
    expect(found.path).toBe("tests/manually-renamed.testcase.yaml");
  });

  it("organize mode auto falls back to append when undecidable", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    const testcasePath = join(workspace, "case.testcase.yaml");
    await writeFile(
      testcasePath,
      [
        "id: case-1",
        "title: Case 1",
        "tags: []",
        "description: demo",
        "scoped: true",
        "status: todo",
        "operations: []",
        "related: []",
        "remarks: []",
        "completedDay: 2026-01-01",
        "tests: []",
        "issues: []",
        ""
      ].join("\n")
    );

    const result = await organizeExecutionTargetsCore({
      workspaceRoot: workspace,
      testcasePath: "case.testcase.yaml",
      strategy: "flow-based",
      mode: "auto",
      write: false
    });

    expect(result.appliedMode).toBe("append");
  });

  it("create case writes a slug based filename", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    await mkdir(join(workspace, "tests"), { recursive: true });

    const result = await createCaseFileCore({
      workspaceRoot: workspace,
      dir: "tests",
      id: "case-22",
      title: "Checkout Flow",
      write: true
    });

    expect(result.writtenFile).toContain("checkout-flow.testcase.yaml");
    const yaml = await readFile(join(workspace, result.writtenFile as string), "utf8");
    expect(yaml).toContain("id: case-22");
  });
});
