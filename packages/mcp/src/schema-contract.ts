import {
  ISSUE_STATUSES,
  TEST_RESULT_STATUSES,
  TESTCASE_STATUSES
} from "@tlog/shared";

export type SchemaTopic = "suite" | "case" | "enum" | "issue" | "all";
export type MissingContextOperation =
  | "create_suite_from_prompt"
  | "create_testcase_from_prompt"
  | "update_suite"
  | "update_case";

type SchemaShape = {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

const schemaUpdatedAt = new Date().toISOString();

const requiredFields = {
  suite: ["id", "title", "tags", "description", "scoped", "owners", "duration", "related", "remarks"],
  case: [
    "id",
    "title",
    "tags",
    "description",
    "scoped",
    "status",
    "operations",
    "related",
    "remarks",
    "completedDay",
    "tests",
    "issues"
  ],
  issue: ["incident", "owners", "causes", "solutions", "status", "detectedDay", "completedDay", "related", "remarks"]
} as const;

const suiteJsonSchema: SchemaShape = {
  type: "object",
  required: [...requiredFields.suite],
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    scoped: { type: "boolean" },
    owners: { type: "array", items: { type: "string" } },
    duration: {
      type: "object",
      properties: {
        scheduled: { type: "object" },
        actual: { type: "object" }
      }
    },
    related: { type: "array", items: { type: "string" } },
    remarks: { type: "array", items: { type: "string" } }
  }
};

const issueJsonSchema: SchemaShape = {
  type: "object",
  required: [...requiredFields.issue],
  additionalProperties: false,
  properties: {
    incident: { type: "string" },
    owners: { type: "array", items: { type: "string" } },
    causes: { type: "array", items: { type: "string" } },
    solutions: { type: "array", items: { type: "string" } },
    status: { type: "string", enum: ISSUE_STATUSES },
    detectedDay: { type: ["string", "null"], format: "date" },
    completedDay: { type: ["string", "null"], format: "date" },
    related: { type: "array", items: { type: "string" } },
    remarks: { type: "array", items: { type: "string" } }
  }
};

const caseJsonSchema: SchemaShape = {
  type: "object",
  required: [...requiredFields.case],
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    scoped: { type: "boolean" },
    status: {
      oneOf: [
        { type: "null" },
        {
          type: "string",
          enum: TESTCASE_STATUSES.filter((value): value is Exclude<(typeof TESTCASE_STATUSES)[number], null> => value !== null)
        }
      ]
    },
    operations: { type: "array", items: { type: "string" } },
    related: { type: "array", items: { type: "string" } },
    remarks: { type: "array", items: { type: "string" } },
    completedDay: { type: ["string", "null"], format: "date" },
    tests: { type: "array", items: { type: "object" } },
    issues: { type: "array", items: issueJsonSchema }
  }
};

const enumValues = {
  testcaseStatus: TESTCASE_STATUSES.filter((value): value is Exclude<(typeof TESTCASE_STATUSES)[number], null> => value !== null),
  testResultStatus: TEST_RESULT_STATUSES.filter(
    (value): value is Exclude<(typeof TEST_RESULT_STATUSES)[number], null> => value !== null
  ),
  issueStatus: ISSUE_STATUSES,
  legacy: {
    issueDetectedAt: "normalized to detectedDay"
  }
};

const suiteExampleMinimal = {
  id: "suite-login",
  title: "Login Suite",
  tags: ["auth"],
  description: "Login flow regression",
  scoped: true,
  owners: ["qa"],
  duration: {
    scheduled: { start: "2026-02-01", end: "2026-02-10" },
    actual: { start: "2026-02-01", end: "2026-02-10" }
  },
  related: [],
  remarks: []
};

const caseExampleMinimal = {
  id: "case-login-001",
  title: "Valid credential login",
  tags: ["auth"],
  description: "Login with valid user and password",
  scoped: true,
  status: "todo",
  operations: ["Open login page", "Enter credentials", "Submit"],
  related: [],
  remarks: [],
  completedDay: null,
  tests: [
    {
      name: "main-path",
      expected: "user is redirected to dashboard",
      actual: "",
      trails: [],
      status: null
    }
  ],
  issues: []
};

const issueExampleMinimal = {
  incident: "Cannot login with valid credentials",
  owners: ["qa"],
  causes: ["auth service timeout"],
  solutions: ["increase timeout and retry"],
  status: "open",
  detectedDay: "2026-02-20",
  completedDay: null,
  related: [],
  remarks: []
};

export function buildTlogSchemaPayload(): Record<string, unknown> {
  return {
    version: "1.0.0",
    updatedAt: schemaUpdatedAt,
    suite: suiteJsonSchema,
    case: caseJsonSchema,
    issue: issueJsonSchema,
    enum: enumValues,
    required: requiredFields,
    format: {
      json: true,
      text: true
    }
  };
}

export function buildTlogSchemaExamplesPayload(): Record<string, unknown> {
  return {
    version: "1.0.0",
    updatedAt: schemaUpdatedAt,
    minimal: {
      suite: suiteExampleMinimal,
      case: caseExampleMinimal,
      issue: issueExampleMinimal
    },
    recommended: {
      suite: { ...suiteExampleMinimal, tags: ["auth", "smoke"], remarks: ["priority:high"] },
      case: {
        ...caseExampleMinimal,
        status: "doing",
        issues: [issueExampleMinimal],
        remarks: ["verify on staging first"]
      }
    }
  };
}

function getTopicNotes(topic: SchemaTopic): string[] {
  if (topic === "suite") {
    return ["Use create_suite_from_prompt or create_suite_file to create suites."];
  }
  if (topic === "case") {
    return ["Use create_testcase_from_prompt or create_case_file to create cases.", "Use detectedDay for issue detection date."];
  }
  if (topic === "issue") {
    return ["Issue date fields are detectedDay/completedDay.", "Legacy detectedAt/completedAt are normalized."];
  }
  if (topic === "enum") {
    return ["Enum values are strict and case-sensitive."];
  }
  return ["Use this payload to prepare inputs before calling mutation tools."];
}

export function getSchemaByTopic(topic: SchemaTopic): Record<string, unknown> {
  const payload = buildTlogSchemaPayload();
  if (topic === "all") {
    return {
      topic,
      schema: payload,
      requiredFields: requiredFields,
      enumValues,
      notes: getTopicNotes(topic)
    };
  }

  if (topic === "enum") {
    return {
      topic,
      schema: { enum: enumValues },
      requiredFields: {},
      enumValues,
      notes: getTopicNotes(topic)
    };
  }

  return {
    topic,
    schema: payload[topic],
    requiredFields: requiredFields[topic],
    enumValues,
    notes: getTopicNotes(topic)
  };
}

export function getSchemaExamplesByTopic(topic: SchemaTopic): Record<string, unknown> {
  const examples = buildTlogSchemaExamplesPayload();
  const minimal = examples.minimal as Record<string, unknown>;
  const recommended = examples.recommended as Record<string, unknown>;
  if (topic === "all" || topic === "enum") {
    return {
      topic,
      schema: examples,
      requiredFields: requiredFields,
      enumValues,
      notes: getTopicNotes(topic)
    };
  }

  return {
    topic,
    schema: {
      minimal: minimal[topic],
      recommended: recommended[topic]
    },
    requiredFields: requiredFields[topic],
    enumValues,
    notes: getTopicNotes(topic)
  };
}

export function getSchemaHints(entityType: "suite" | "case"): Record<string, unknown> {
  return {
    entityType,
    requiredFields: requiredFields[entityType],
    enumValues,
    notes: [
      "Do not add undefined fields.",
      "Use enum values exactly as defined.",
      "Run validate_tests_directory after write=true operations."
    ]
  };
}

export function collectMissingContext(
  operation: MissingContextOperation,
  draft: Record<string, unknown>
): {
  missingFields: string[];
  questions: string[];
  nextAction: string;
} {
  const missingFields: string[] = [];

  if (operation === "create_suite_from_prompt") {
    if (typeof draft.instruction !== "string" || draft.instruction.trim().length === 0) {
      missingFields.push("instruction");
    }
    if (typeof draft.targetDir !== "string" || draft.targetDir.trim().length === 0) {
      missingFields.push("targetDir");
    }
  }

  if (operation === "create_testcase_from_prompt") {
    if (typeof draft.instruction !== "string" || draft.instruction.trim().length === 0) {
      missingFields.push("instruction");
    }
    if (typeof draft.suiteDir !== "string" || draft.suiteDir.trim().length === 0) {
      missingFields.push("suiteDir");
    }

    const context = asRecord(draft.context);
    const operations = Array.isArray(context.operations)
      ? context.operations.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    if (operations.length === 0) {
      missingFields.push("context.operations");
    }

    const tests = Array.isArray(context.tests) ? context.tests : [];
    const hasExpected = tests.some((item) => {
      const test = asRecord(item);
      return typeof test.expected === "string" && test.expected.trim().length > 0;
    });
    const expectedRaw = context.expected;
    const hasContextExpected =
      (typeof expectedRaw === "string" && expectedRaw.trim().length > 0) ||
      (Array.isArray(expectedRaw) &&
        expectedRaw.some((item) => typeof item === "string" && item.trim().length > 0));

    if (!hasExpected && !hasContextExpected) {
      missingFields.push("context.tests[].expected");
    }
  }

  if (operation === "update_suite") {
    if (typeof draft.id !== "string" || draft.id.trim().length === 0) {
      missingFields.push("id");
    }
    if (!draft.patch || typeof draft.patch !== "object") {
      missingFields.push("patch");
    }
  }

  if (operation === "update_case") {
    if (typeof draft.id !== "string" || draft.id.trim().length === 0) {
      missingFields.push("id");
    }
    if (!draft.patch || typeof draft.patch !== "object") {
      missingFields.push("patch");
    }
  }

  const questions = missingFields.map((field) => toQuestion(field));

  return {
    missingFields,
    questions,
    nextAction:
      missingFields.length > 0
        ? `Fill missing fields and call ${operation} again.`
        : `Context is sufficient. Continue with ${operation}.`
  };
}

export function buildMissingContextGuidance(
  operation: MissingContextOperation,
  draft: Record<string, unknown>
): Record<string, unknown> {
  const workspaceRoot =
    typeof draft.workspaceRoot === "string" && draft.workspaceRoot.trim().length > 0
      ? draft.workspaceRoot
      : "/absolute/workspace/path";

  if (operation === "create_testcase_from_prompt") {
    const suiteDir =
      typeof draft.suiteDir === "string" && draft.suiteDir.trim().length > 0 ? draft.suiteDir : "tests/mcp";
    const instruction =
      typeof draft.instruction === "string" && draft.instruction.trim().length > 0
        ? draft.instruction
        : "作成したいテストケースの目的を記述";

    return {
      why: "create_testcase_from_prompt では、生成品質を上げるため context.operations と期待結果（context.tests[].expected または context.expected）を必須にしています。",
      contextTemplate: {
        operations: ["事前条件を確認する", "対象コマンドを実行する", "終了コードと出力を確認する"],
        tests: [
          {
            name: "happy-path",
            expected: "期待する出力形式と終了コードが得られる"
          },
          {
            name: "error-path",
            expected: "異常系で適切なエラーと非0終了コードが得られる"
          }
        ],
        expected: ["期待する出力形式と終了コードが得られる"]
      },
      retryExample: {
        workspaceRoot,
        suiteDir,
        instruction,
        context: {
          operations: ["事前条件を確認する", "対象コマンドを実行する", "終了コードと出力を確認する"],
          tests: [{ name: "happy-path", expected: "期待する出力形式と終了コードが得られる" }]
        },
        write: false
      }
    };
  }

  if (operation === "create_suite_from_prompt") {
    const targetDir =
      typeof draft.targetDir === "string" && draft.targetDir.trim().length > 0 ? draft.targetDir : "tests/mcp";
    const instruction =
      typeof draft.instruction === "string" && draft.instruction.trim().length > 0
        ? draft.instruction
        : "id: suite-sample; title: Sample Suite";

    return {
      why: "create_suite_from_prompt では instruction と targetDir が必要です。",
      retryExample: {
        workspaceRoot,
        targetDir,
        instruction,
        write: false
      }
    };
  }

  return {
    why: "不足項目を埋めて再実行してください。"
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toQuestion(field: string): string {
  if (field === "context.operations") {
    return "実施手順を 3-7 個の箇条書きで教えてください（例: 事前条件確認、コマンド実行、結果確認）。";
  }
  if (field === "context.tests[].expected") {
    return "各テスト観点の期待結果を教えてください（例: 出力形式、終了コード、エラーメッセージ）。context.expected で共通期待をまとめて渡しても構いません。";
  }
  if (field === "suiteDir") {
    return "作成先ディレクトリ（例: tests/mcp）を教えてください。";
  }
  return `Please provide ${field}.`;
}

export function getSchemaUsageTemplate(useCase: "create_suite" | "create_case" | "update_case"): string {
  const common = [
    "Goal: generate schema-safe tool input for TLog.",
    "Step 1: Call get_tlog_schema(topic) and get_tlog_schema_examples(topic).",
    "Step 2: Build input using only schema-defined fields.",
    "Step 3: Use enum values exactly as declared (case-sensitive).",
    "Step 4: Call collect_missing_context(operation, draft) before mutation calls.",
    "Step 5: If missingFields is non-empty, ask user questions and retry.",
    "Step 6: Run mutation tool with write=false first, then write=true after review."
  ];

  if (useCase === "create_suite") {
    return [
      ...common,
      "",
      "Use case: create_suite",
      "Tool: create_suite_from_prompt",
      "Input template:",
      "{ workspaceRoot, targetDir, instruction, defaults?, write }",
      "Instruction recommendation: include id and title explicitly.",
      "Expected helper fields in response: schemaHints, warnings, diffSummary."
    ].join("\n");
  }

  if (useCase === "create_case") {
    return [
      ...common,
      "",
      "Use case: create_case",
      "Tool: create_testcase_from_prompt",
      "Input template:",
      "{ workspaceRoot, suiteDir, instruction, context?, write }",
      "Recommended context (preferred):",
      "{ operations: string[], tests: [{ name, expected }], tags?: string[], description?: string }",
      "Fallback context (only if tests is hard to construct):",
      "{ operations: string[], expected: string|string[], tags?: string[], description?: string }",
      "Issue date fields: detectedDay/completedDay (legacy detectedAt/completedAt are normalized).",
      "Expected helper fields in response: schemaHints, warnings, diffSummary."
    ].join("\n");
  }

  return [
    ...common,
    "",
    "Use case: update_case",
    "Tool: update_case",
    "Input template:",
    "{ workspaceRoot, dir, id, patch, write }",
    "Patch rule: do not include unknown keys; id is immutable."
  ].join("\n");
}
