import { mkdtemp, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  __internal,
  buildMissingContextGuidance,
  buildTlogSchemaPayload,
  collectMissingContext,
  createCaseFileCore,
  createMcpServer,
  createTestcaseFromPromptCore,
  createSuiteFileCore,
  createSuiteFromPromptCore,
  deleteCaseCore,
  deleteSuiteCore,
  getSchemaByTopic,
  getSchemaExamplesByTopic,
  getSchemaHints,
  getSchemaUsageTemplate,
  getWorkspaceSnapshotCore,
  hasStdioFlag,
  main,
  initTestsDirectoryCore,
  listCasesCore,
  listSuitesCore,
  organizeExecutionTargetsCore,
  resolveEntityPathByIdCore,
  resolveRelatedTargetsCore,
  suiteStatsCore,
  syncRelatedCore,
  updateCaseCore,
  updateSuiteCore,
  validateTestsDirectoryCore
} from "../src/index.js";
import { createCaseFileInputSchema, listCasesInputSchema, validateMutationDraft } from "../src/schemas.js";

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

  it("main sets exitCode=1 when --stdio is missing", async () => {
    const prev = process.exitCode;
    process.exitCode = undefined;
    await main(["node", "tlog-mcp"]);
    expect(process.exitCode).toBe(1);
    process.exitCode = prev;
  });
});

describe("tool input schemas", () => {
  it("rejects unknown fields in create_case_file fields payload", () => {
    const parsed = z.object(createCaseFileInputSchema).safeParse({
      workspaceRoot: "/workspaces/tlog",
      dir: "tests/mcp",
      id: "case-001",
      title: "Case 001",
      fields: {
        status: "doing",
        unexpectedField: "should-fail"
      }
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects invalid list_cases status enum", () => {
    const parsed = z.object(listCasesInputSchema).safeParse({
      workspaceRoot: "/workspaces/tlog",
      dir: "tests/mcp",
      filters: {
        status: "invalid-status"
      }
    });

    expect(parsed.success).toBe(false);
  });

  it("preflight validator rejects unknown top-level keys", () => {
    const result = validateMutationDraft("create_case_file", {
      workspaceRoot: "/workspaces/tlog",
      dir: "tests/mcp",
      id: "case-001",
      title: "Case 001",
      write: false,
      unexpectedTopLevel: true
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.path === "(root)")).toBe(true);
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
    expect((result.suite as { description: string }).description.length).toBeGreaterThan(0);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("create_suite_from_prompt writes suite as index.yaml", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    await mkdir(join(workspace, "tests", "mcp"), { recursive: true });

    const result = await createSuiteFromPromptCore({
      workspaceRoot: workspace,
      targetDir: "tests/mcp",
      instruction: "id: suite-mcp; title: MCP Suite",
      write: true
    });

    expect(result.writtenFile).toBe("tests/mcp/index.yaml");
  });

  it("guards workspace boundary", () => {
    expect(() => __internal.resolvePathInsideWorkspace("/tmp/work", "../../etc/passwd")).toThrow(/security/);
  });

  it("extractPromptMetadata infers id from title when id is missing", () => {
    const meta = __internal.extractPromptMetadata("title: Login Smoke", "case");
    expect(meta.id).toBe("case-login-smoke");
    expect(meta.warnings.some((w: string) => w.includes("id was inferred from title"))).toBe(true);
  });

  it("selectAppliedMode chooses replace on explicit replace keyword", () => {
    expect(__internal.selectAppliedMode("auto", "please replace tests")).toBe("replace");
    expect(__internal.selectAppliedMode("auto", "置換してください")).toBe("replace");
  });

  it("findAvailablePath returns a non-conflicting path when file already exists", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    const base = join(workspace, "case.testcase.yaml");
    await writeFile(base, "id: c1\n");
    const next = __internal.findAvailablePath(base);
    expect(next).not.toBe(base);
    expect(next).toContain("case.testcase-2.yaml");
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

  it("ignores legacy issue day fields and keeps latest schema only", () => {
    const normalized = __internal.normalizeCaseCandidate({
      id: "c2",
      title: "Case 2",
      completedDay: null,
      issues: [
        {
          incident: "legacy issue",
          owners: [],
          causes: [],
          solutions: [],
          status: "open",
          completedAt: "2026-02-20",
          detectedAt: "2026-02-19",
          related: [],
          remarks: []
        }
      ]
    });

    expect(normalized.entity.completedDay).toBeNull();
    expect(normalized.entity.issues[0]?.detectedDay).toBeNull();
    expect(normalized.entity.issues[0]?.completedDay).toBeNull();
  });

  it("maps legacy issue detail fields cause/solution", () => {
    const normalized = __internal.normalizeCaseCandidate({
      id: "c3",
      title: "Case 3",
      issues: [
        {
          incident: "legacy detail field",
          owners: [],
          cause: ["legacy-cause"],
          solution: ["legacy-solution"],
          status: "open",
          completedDay: null,
          related: [],
          remarks: []
        }
      ]
    });

    expect(normalized.entity.issues[0]?.causes).toEqual(["legacy-cause"]);
    expect(normalized.entity.issues[0]?.solutions).toEqual(["legacy-solution"]);
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

  it("create case writes an id-based filename", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    await mkdir(join(workspace, "tests"), { recursive: true });

    const result = await createCaseFileCore({
      workspaceRoot: workspace,
      dir: "tests",
      id: "case-22",
      title: "Checkout Flow",
      write: true
    });

    expect(result.writtenFile).toContain("case-22.testcase.yaml");
    const yaml = await readFile(join(workspace, result.writtenFile as string), "utf8");
    expect(yaml).toContain("id: case-22");
    expect(yaml).toContain("description:");
  });

  it("infers title from id when title is missing in instruction", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    const result = await createSuiteFromPromptCore({
      workspaceRoot: workspace,
      targetDir: "tests",
      instruction: "id: suite-from-id",
      write: false
    });

    const suite = result.suite as { title: string };
    expect(suite.title).toBe("suite-from-id");
    expect((result.warnings as string[]).some((warning) => warning.includes("title was inferred from id"))).toBe(true);
  });

  it("create_suite_file writes suite as index.yaml", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    await mkdir(join(workspace, "tests", "suite-a"), { recursive: true });

    const result = await createSuiteFileCore({
      workspaceRoot: workspace,
      dir: "tests/suite-a",
      id: "suite-a",
      title: "Suite A",
      write: true
    });

    expect(result.writtenFile).toBe("tests/suite-a/index.yaml");
  });

  it("uses context operations and expected outcomes when provided", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    const result = await createTestcaseFromPromptCore({
      workspaceRoot: workspace,
      suiteDir: "tests/mcp",
      instruction: "CLI command test case",
      context: {
        operations: ["prepare environment", "run command", "verify output"],
        tests: [{ name: "happy-path", expected: "command succeeds" }]
      },
      write: false
    });

    const testcase = result.testcase as { operations: string[]; tests: Array<{ expected: string }> };
    expect(testcase.operations).toEqual(["prepare environment", "run command", "verify output"]);
    expect(testcase.tests[0]?.expected).toBe("command succeeds");
    expect(testcase.tests[0]).toHaveProperty("actual");
    expect(testcase.tests[0]).toHaveProperty("trails");
    expect(testcase.tests[0]).toHaveProperty("status");
  });

  it("normalizes invalid test result status to null", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    const result = await createTestcaseFromPromptCore({
      workspaceRoot: workspace,
      suiteDir: "tests/mcp",
      instruction: "id: case-invalid-status; title: Invalid Status Case",
      context: {
        operations: ["run"],
        tests: [{ name: "t1", expected: "ok", status: "todo" }]
      },
      write: false
    });

    const testcase = result.testcase as { tests: Array<{ status: unknown }> };
    expect(testcase.tests[0]?.status).toBeNull();
  });

  it("provides tlog schema payload and topic-based schema", () => {
    const payload = buildTlogSchemaPayload();
    expect(payload).toHaveProperty("suite");
    expect(payload).toHaveProperty("case");
    expect(payload).toHaveProperty("enum");

    const topic = getSchemaByTopic("issue");
    expect(topic.topic).toBe("issue");
    expect(topic).toHaveProperty("requiredFields");

    const all = getSchemaByTopic("all");
    expect(all.topic).toBe("all");

    const enums = getSchemaByTopic("enum");
    expect(enums.topic).toBe("enum");
    expect(enums).toHaveProperty("enumValues");

    const examplesAll = getSchemaExamplesByTopic("all");
    expect(examplesAll.topic).toBe("all");
  });

  it("collect_missing_context contract returns missing fields and questions", () => {
    const result = collectMissingContext("create_testcase_from_prompt", {
      instruction: "",
      suiteDir: ""
    });

    expect(result.missingFields).toContain("instruction");
    expect(result.missingFields).toContain("suiteDir");
    expect(result.missingFields).toContain("context.operations");
    expect(result.missingFields).toContain("context.tests[].expected");
    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.nextAction).toContain("create_testcase_from_prompt");
  });

  it("treats context.expected as satisfying expected context", () => {
    const result = collectMissingContext("create_testcase_from_prompt", {
      instruction: "id: case-expected-only; title: Expected Only",
      suiteDir: "tests/mcp",
      context: {
        operations: ["run command", "verify output"],
        expected: "command exits 0 and prints expected fields"
      }
    });

    expect(result.missingFields).not.toContain("context.tests[].expected");
  });

  it("provides missing context guidance template", () => {
    const guidance = buildMissingContextGuidance("create_testcase_from_prompt", {
      workspaceRoot: "/workspaces/tlog",
      suiteDir: "tests/mcp",
      instruction: "kubernetes get pod test"
    });

    expect(guidance).toHaveProperty("retryExample");
    expect(guidance).toHaveProperty("contextTemplate");

    const suiteGuidance = buildMissingContextGuidance("create_suite_from_prompt", {
      workspaceRoot: "/workspaces/tlog",
      targetDir: "tests/mcp",
      instruction: "id: suite-sample; title: Sample"
    });
    expect(suiteGuidance).toHaveProperty("retryExample");

    const updateGuidance = buildMissingContextGuidance("update_case", {
      workspaceRoot: "/workspaces/tlog",
      id: "case-1"
    });
    expect(updateGuidance).toHaveProperty("why");
  });

  it("returns schema hints and schema usage template", () => {
    const hints = getSchemaHints("case");
    expect(hints).toHaveProperty("requiredFields");
    expect(hints).toHaveProperty("enumValues");

    const usage = getSchemaUsageTemplate("create_suite");
    expect(usage).toContain("create_suite_from_prompt");
  });

  it("updates suite and case by id with patch", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    await initTestsDirectoryCore({ workspaceRoot: workspace, outputDir: "tests", write: true });

    const suiteList = await listSuitesCore({ workspaceRoot: workspace, dir: "tests" });
    const caseList = await listCasesCore({ workspaceRoot: workspace, dir: "tests" });

    const suiteId = (suiteList.suites as Array<{ id: string }>)[0]?.id;
    const caseId = (caseList.cases as Array<{ id: string }>)[0]?.id;
    expect(suiteId).toBeTruthy();
    expect(caseId).toBeTruthy();

    const updatedSuite = await updateSuiteCore({
      workspaceRoot: workspace,
      dir: "tests",
      id: suiteId as string,
      patch: { description: "updated suite description" },
      write: true
    });
    expect(updatedSuite.updated).toBe(true);
    expect((updatedSuite.after as { description: string }).description).toBe("updated suite description");

    const updatedCase = await updateCaseCore({
      workspaceRoot: workspace,
      dir: "tests",
      id: caseId as string,
      patch: { status: "doing" },
      write: true
    });
    expect(updatedCase.updated).toBe(true);
    expect((updatedCase.after as { status: string }).status).toBe("doing");
  });

  it("resolves and syncs related ids", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    await initTestsDirectoryCore({ workspaceRoot: workspace, outputDir: "tests", write: true });

    const suiteList = await listSuitesCore({ workspaceRoot: workspace, dir: "tests" });
    const caseList = await listCasesCore({ workspaceRoot: workspace, dir: "tests" });
    const suiteId = (suiteList.suites as Array<{ id: string }>)[0]?.id as string;
    const caseId = (caseList.cases as Array<{ id: string }>)[0]?.id as string;

    const syncResult = await syncRelatedCore({
      workspaceRoot: workspace,
      dir: "tests",
      sourceId: suiteId,
      relatedIds: [caseId, "missing-id"],
      mode: "two-way",
      write: true
    });

    expect(syncResult.synced).toBe(true);
    expect(syncResult.missing).toContain("missing-id");

    const resolved = await resolveRelatedTargetsCore({
      workspaceRoot: workspace,
      dir: "tests",
      sourceId: suiteId
    });
    expect((resolved.resolved as Array<{ id: string }>).some((item) => item.id === caseId)).toBe(true);
  });

  it("supports expanded list_cases filters", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    await initTestsDirectoryCore({ workspaceRoot: workspace, outputDir: "tests", write: true });

    const caseList = await listCasesCore({ workspaceRoot: workspace, dir: "tests" });
    const caseId = (caseList.cases as Array<{ id: string }>)[0]?.id as string;

    await updateCaseCore({
      workspaceRoot: workspace,
      dir: "tests",
      id: caseId,
      patch: {
        tags: ["smoke", "auth"],
        issues: [
          {
            incident: "Login timeout issue",
            owners: ["qa"],
            causes: ["network"],
            solutions: ["retry"],
            status: "open",
            detectedDay: "2026-02-20",
            completedDay: null,
            related: [],
            remarks: ["intermittent"]
          }
        ]
      },
      write: true
    });

    const filtered = await listCasesCore({
      workspaceRoot: workspace,
      dir: "tests",
      filters: {
        tags: ["auth"],
        owners: ["qa"],
        scopedOnly: true,
        issueHas: "timeout",
        issueStatus: "open"
      }
    });

    expect((filtered.cases as Array<{ id: string }>).some((item) => item.id === caseId)).toBe(true);
  });

  it("enforces id format and duplicate id conflict", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    await mkdir(join(workspace, "tests"), { recursive: true });

    await expect(
      createCaseFileCore({
        workspaceRoot: workspace,
        dir: "tests",
        id: "invalid id",
        title: "Invalid Id",
        write: false
      })
    ).rejects.toThrow(/invalid id format/);

    const first = await createCaseFileCore({
      workspaceRoot: workspace,
      dir: "tests",
      id: "same-id",
      title: "Case 1",
      write: true
    });
    expect(first.writtenFile).toBeTruthy();

    await expect(
      createCaseFileCore({
        workspaceRoot: workspace,
        dir: "tests",
        id: "same-id",
        title: "Case 2",
        write: false
      })
    ).rejects.toThrow(/id already exists/);
  });

  it("returns workspace snapshot and suite stats", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    await initTestsDirectoryCore({ workspaceRoot: workspace, outputDir: "tests", write: true });

    const snapshot = await getWorkspaceSnapshotCore({
      workspaceRoot: workspace,
      dir: "tests",
      excludeUnscoped: false
    });
    expect((snapshot.summary as { suiteCount: number }).suiteCount).toBeGreaterThan(0);
    expect((snapshot.summary as { caseCount: number }).caseCount).toBeGreaterThan(0);

    const suiteList = await listSuitesCore({ workspaceRoot: workspace, dir: "tests" });
    const suiteId = (suiteList.suites as Array<{ id: string }>)[0]?.id as string;
    const stats = await suiteStatsCore({
      workspaceRoot: workspace,
      dir: "tests",
      suiteId,
      excludeUnscoped: false
    });
    expect(stats).toHaveProperty("summary");
    expect(stats).toHaveProperty("burndown");
  });

  it("suite stats burndown counts only suite scoped=true and case scoped=true", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    await initTestsDirectoryCore({ workspaceRoot: workspace, outputDir: "tests", write: true });

    const suiteList = await listSuitesCore({ workspaceRoot: workspace, dir: "tests" });
    const suiteId = (suiteList.suites as Array<{ id: string }>)[0]?.id as string;
    const caseList = await listCasesCore({ workspaceRoot: workspace, dir: "tests" });
    const caseId = (caseList.cases as Array<{ id: string }>)[0]?.id as string;

    await updateSuiteCore({
      workspaceRoot: workspace,
      dir: "tests",
      id: suiteId,
      patch: { scoped: false },
      write: true
    });
    await updateCaseCore({
      workspaceRoot: workspace,
      dir: "tests",
      id: caseId,
      patch: { scoped: true, status: "done", completedDay: "2026-02-20" },
      write: true
    });

    const stats = await suiteStatsCore({
      workspaceRoot: workspace,
      dir: "tests",
      suiteId,
      excludeUnscoped: false
    });
    expect((stats.summary as { total: number }).total).toBe(0);
    expect((stats.anomalies as string[]).includes("no_target_cases")).toBe(true);
  });

  it("supports safe delete tools with dryRun and confirm", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    await initTestsDirectoryCore({ workspaceRoot: workspace, outputDir: "tests", write: true });

    const suites = await listSuitesCore({ workspaceRoot: workspace, dir: "tests" });
    const cases = await listCasesCore({ workspaceRoot: workspace, dir: "tests" });
    const suiteId = (suites.suites as Array<{ id: string }>)[0]?.id as string;
    const caseId = (cases.cases as Array<{ id: string }>)[0]?.id as string;

    const drySuite = await deleteSuiteCore({
      workspaceRoot: workspace,
      dir: "tests",
      id: suiteId,
      dryRun: true
    });
    expect(drySuite.deleted).toBe(false);

    await expect(
      deleteCaseCore({
        workspaceRoot: workspace,
        dir: "tests",
        id: caseId,
        dryRun: false,
        confirm: false
      })
    ).rejects.toThrow(/confirm=true/);

    const casePath = join(workspace, "tests", `${caseId}.testcase.yaml`);
    const executed = await deleteCaseCore({
      workspaceRoot: workspace,
      dir: "tests",
      id: caseId,
      dryRun: false,
      confirm: true
    });
    expect(executed.deleted).toBe(true);
    await expect(readFile(casePath, "utf8")).rejects.toThrow();
  });

  it("resolve_related_targets fails when source id is missing", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tlog-mcp-"));
    await initTestsDirectoryCore({ workspaceRoot: workspace, outputDir: "tests", write: true });
    await expect(
      resolveRelatedTargetsCore({
        workspaceRoot: workspace,
        dir: "tests",
        sourceId: "not-found"
      })
    ).rejects.toThrow(/source id not found/);
  });
});
