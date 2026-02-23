# @tlog/shared

`@tlog/shared` は CLI / MCP / VS Code extension で共通利用するドメインモデルとコアロジックを提供する。

## Task Coverage

- `TASK-001` Domain types / enums: `src/domain.ts`, `src/schemas.ts`
- `TASK-002` Schema validator: `src/validation.ts`
- `TASK-003` YAML parser/serializer: `src/yaml-io.ts`
- `TASK-004` ID index / reference resolution: `src/id-index.ts`
- `TASK-005` File naming / slug policy: `src/naming.ts`
- `TASK-006` Default builders: `src/builders.ts`
- `TASK-007` Search / filter engine: `src/filter.ts`
- `TASK-008` Statistics / burndown engine: `src/statistics.ts`
- `TASK-009` Template apply / extract: `src/template.ts`
- `TASK-010` Error model / result contract: `src/result.ts`

## API Contracts

### Domain (`TASK-001`)

- `type Suite`
  - input/output fields: `id`, `title`, `tags`, `description`, `scoped`, `owners`, `duration`, `related`, `remarks`
- `type TestCase`
  - input/output fields: `id`, `title`, `tags`, `description`, `scoped`, `status`, `operations`, `related`, `remarks`, `completedDay`, `tests`, `issues`
- `type TestItem`
  - input/output fields: `name`, `expected`, `actual`, `trails`, `status`
- `type Issue`
  - input/output fields: `incident`, `owners`, `causes`, `solutions`, `status`, `detectedDay`, `completedDay`, `related`, `remarks`
- status enums
  - testcase status: `"todo" | "doing" | "done" | null`
  - test result status: `"pass" | "fail" | "skip" | "block" | null`
  - issue status: `"open" | "doing" | "resolved" | "pending"`
- date
  - `type TlogDateString`
  - guard: `isTlogDateString(value: string): value is TlogDateString`
  - converter: `asTlogDateString(value: string): TlogDateString`

### Validation (`TASK-002`)

- `validateSuite(input: unknown): ValidationResult<Suite>`
- `validateCase(input: unknown): ValidationResult<TestCase>`
- `ValidationResult<T>`
  - `ok: boolean`
  - `data?: T` (`ok === true` のとき)
  - `errors: ValidationDiagnostic[]`
  - `warnings: ValidationDiagnostic[]`
- `ValidationDiagnostic`
  - `path: string`
  - `message: string`

### YAML I/O (`TASK-003`)

- `parseYaml<T>(source: string): T`
  - invalid YAML の場合 `TlogYamlParseError` を throw
  - `TlogYamlParseError` fields: `line`, `column`, `message`
- `stringifyYaml(value: unknown): string`
- `readYamlFile<T>(path: string): Promise<T>`
- `writeYamlFileAtomic(path: string, value: unknown): Promise<void>`
  - temp file 書き込み後に rename する atomic write

### ID Resolution (`TASK-004`)

- `buildIdIndex(rootDir: string): Promise<IdIndex>`
- `resolveById(index: IdIndex, id: string): TlogIndexedEntity | undefined`
- `resolveRelated(index: IdIndex, source: { related: string[] }): RelatedResolution`
- `IdIndex`
  - `byId: Map<string, TlogIndexedEntity>`
  - `entities: TlogIndexedEntity[]`
  - `duplicates: { id: string; paths: string[] }[]`

### Naming (`TASK-005`)

- `slugifyTitle(title: string): string`
- `ensureUniqueSlug(baseSlug: string, usedSlugs: Set<string>): string`
- `buildSuiteFileName(id: string, title: string): string`
- `buildCaseFileName(id: string, title: string): string`
- `normalizeTlogPath(input: string): string`

### Builders (`TASK-006`)

- `buildDefaultSuite(input: BuildDefaultSuiteInput): Suite`
- `buildDefaultCase(input: BuildDefaultCaseInput): TestCase`
- builder は内部で `validateSuite` / `validateCase` を実行し、invalid な場合 throw する

### Filter Engine (`TASK-007`)

- `evaluateFilters(entity: Suite | TestCase, filters: SearchFilters): FilterMeta`
- `filterEntities<T extends Suite | TestCase>(entities: T[], filters: SearchFilters): { items: T[]; meta: FilterMeta }`
- `SearchFilters`
  - `tags?: string[]`
  - `owners?: string[]`
  - `testcaseStatus?: TestCaseStatus[]`
  - `testStatus?: TestResultStatus[]`
  - `date?: DateFilter`

### Statistics (`TASK-008`)

- `summarizeStatus(cases: TestCase[]): StatusSummary`
  - `todo`, `doing`, `done`, `total`
- `calculateBurndown(cases: TestCase[], start: string, end: string): BurndownResult`
  - `summary: StatusSummary`
  - `buckets: BurndownBucket[]`
  - `anomalies: string[]` (`invalid_date_range`, `no_target_cases` など)

### Template (`TASK-009`)

- `applyTemplate(suiteInput, caseInput, template?): { suite: Suite; testCase: TestCase }`
- `extractTemplateFromDirectory(rootDir: string): Promise<TlogTemplate>`
- `validateTemplate(template: TlogTemplate): { valid: boolean; errors: string[] }`

### Result Contract (`TASK-010`)

- `type Result<T, E = TlogError>`
  - success: `{ ok: true; data: T; warnings: TlogWarning[] }`
  - failure: `{ ok: false; error: E; warnings: TlogWarning[] }`
- `ok<T>(data: T, warnings?: TlogWarning[]): Result<T>`
- `err<E>(error: E, warnings?: TlogWarning[]): Result<never, E>`
- `serializeResult(result): string` (`--json` / MCP response / VS Code diagnostics への橋渡し用)

## Usage Example

```ts
import {
  buildDefaultCase,
  buildDefaultSuite,
  validateCase,
  writeYamlFileAtomic
} from "@tlog/shared";

const suite = buildDefaultSuite({ id: "suite-login", title: "Login Suite" });
const testCase = buildDefaultCase({ id: "case-login-001", title: "Login happy path" });

const caseValidation = validateCase(testCase);
if (!caseValidation.ok) {
  throw new Error(caseValidation.errors.map((e) => e.message).join(", "));
}

await writeYamlFileAtomic("tests/index.yaml", suite);
await writeYamlFileAtomic("tests/case-login-001.yaml", testCase);
```
