# @tlog/cli

`tlog` is a YAML-first test management CLI.

It helps you bootstrap a test workspace, create suites/cases, validate schema consistency, and manage related links from the terminal.

## Install

### Option 1: Global install (recommended for daily use)

```bash
npm install -g @tlog/cli
```

Check installation:

```bash
tlog --version
tlog --help
```

### Option 2: Run without installing globally

```bash
npx @tlog/cli --help
```

## Quick Start

This is the fastest path from an empty repo to usable test files.

1. Initialize a workspace directory (recommended: always pass `--output`; default is `tests`).

```bash
tlog init --output tests
```

2. Create your first suite.

```bash
tlog suite create --id auth --title "Authentication"
```

3. Create your first case in that suite.

```bash
tlog case create --suite-dir tests/auth --id login-success --title "User can log in"
```

4. Validate everything.

```bash
tlog validate
```

Expected structure after steps 1-3:

```text
tests/
├─ index.yaml
├─ default-case.testcase.yaml
└─ auth/
   ├─ index.yaml
   └─ login-success.testcase.yaml
```

Need command-level help?

```bash
tlog --help
tlog suite --help
tlog case --help
tlog related --help
```

## Core Concepts

- `suite`: represented by `index.yaml` (or `*.suite.yaml` in broader ecosystem usage).
- `case`: represented by `*.testcase.yaml`.
- IDs must match `^[A-Za-z0-9_-]+$`.
- By default, most commands search under `tests/`.

## Deep Dive: `init`

`init` creates a ready-to-use base workspace.

### Recommended usage (explicit output directory)

```bash
tlog init --output tests
```

Creates:

- `tests/index.yaml`
- `tests/default-case.testcase.yaml`

(`--output` is optional; if omitted, `tests` is used.)

### Use a custom output directory

```bash
tlog init --output qa-tests
```

### Initialize from a local template directory

```bash
tlog init --template templates/default --output tests
```

Template requirements:

- Must contain `index.yaml`.
- May include one or more case YAML files; the first one is used as the case template.
- Template must pass schema validation.

### Preview changes before writing files

```bash
tlog init --dry-run
```

### Machine-readable output

```bash
tlog init --json
```

## Deep Dive: `suite create` and `case create`

Creation commands are designed to be strict and predictable.

### `suite create`

```bash
tlog suite create \
  --id auth \
  --title "Authentication" \
  --dir tests \
  --owners qa-team,backend \
  --tags smoke,critical \
  --scheduled-start 2026-02-01 \
  --scheduled-end 2026-02-15
```

Behavior:

- Creates suite directory: `tests/<id>/`
- Writes suite file: `tests/<id>/index.yaml`
- Rejects duplicate IDs across YAML files under `--dir`
- Rejects invalid IDs

### `case create`

```bash
tlog case create \
  --suite-dir tests/auth \
  --id login-success \
  --title "User can log in" \
  --status todo \
  --tags smoke,auth
```

Behavior:

- Writes case file: `<suite-dir>/<id>.testcase.yaml`
- Verifies `--suite-dir` exists
- Rejects duplicate IDs (searched in parent root of the suite directory)
- Supports status: `todo | doing | done | null`

## Template Workflow (Reusable Bootstrap)

Create a reusable template from defaults:

```bash
tlog template --output templates/default
```

Extract template from existing test directory:

```bash
tlog template --from tests --output templates/team-standard
```

List available templates:

```bash
tlog list templates --dir templates --format text
```

## Command Reference

### Global options

- `--dry-run`: preview without writing files
- `--json`: force JSON output
- `--yes`: skip confirmation prompts (mainly for delete flows)

### Workspace bootstrap

- `tlog init [--template <dir>] [--output <dir>]`
- `tlog template [--from <dir>] [--output <dir>]`

### Suite commands

- `tlog suite create --id <id> --title <title> [--dir <dir>] [--owners <a,b>] [--tags <a,b>] [--scheduled-start <YYYY-MM-DD>] [--scheduled-end <YYYY-MM-DD>]`
- `tlog suite update --id <id> [--dir <dir>] [--title <title>] [--description <text>] [--tags <a,b>] [--owners <a,b>] [--related <a,b>] [--remarks <a,b>] [--scoped <true|false>] [--scheduled-start <YYYY-MM-DD>] [--scheduled-end <YYYY-MM-DD>] [--actual-start <YYYY-MM-DD>] [--actual-end <YYYY-MM-DD>]`
- `tlog suite delete --id <id> [--dir <dir>] [--yes]`
- `tlog suite stats --id <id> [--dir <dir>] [--format <text|json>]`
- `tlog suite list [--dir <dir>] [--id <pattern>] [--format <text|json|csv>] [--output <path>]`

### Case commands

- `tlog case create --suite-dir <dir> --id <id> --title <title> [--owners <a,b>] [--status <todo|doing|done|null>] [--tags <a,b>]`
- `tlog case update --id <id> [--dir <dir>] [--owners <a,b>] [--status <todo|doing|done|null>] [--tags <a,b>] [--description <text>] [--operations <a,b>] [--related <a,b>] [--remarks <a,b>] [--scoped <true|false>] [--completed-day <YYYY-MM-DD|null>] [--tests-file <path>] [--issues-file <path>]`
- `tlog case delete --id <id> [--dir <dir>] [--yes]`
- `tlog case list [--dir <dir>] [--id <pattern>] [--tag <tag>] [--owners <a,b>] [--scoped-only] [--issue-has <keyword>] [--issue-status <open|doing|resolved|pending>] [--status <todo|doing|done|null>] [--format <text|json|csv>] [--output <path>]`

### Related link commands

- `tlog related sync [--dir <dir>] [--id <id>]`
- `tlog related list --id <id> [--dir <dir>] [--format <text|json|csv>]`

### Validation and listing

- `tlog validate [--dir <dir>] [--fail-on-warning] [--watch] [--watch-interval <ms>] [--format <text|json>]`
- `tlog list templates [--dir <dir>] [--format <text|json|csv>] [--output <path>]`

## Practical Usage Patterns

### 1) CI-friendly validation

```bash
tlog validate --dir tests --format json --fail-on-warning
```

- Exit code is non-zero on validation failure.
- Useful for pull request gates.

### 2) Bulk case filtering and export

```bash
tlog case list --dir tests --status doing --format csv --output reports/doing-cases.csv
```

### 3) Safe delete with explicit confirmation skip

```bash
tlog case delete --dir tests --id login-success --yes
```

Delete behavior:

- Files are moved to `.tlog-trash/` (near the root directory parent), not immediately hard-deleted.

## JSON Output Contract

Success shape:

```json
{
  "ok": true,
  "command": "suite create",
  "data": {
    "id": "auth",
    "path": "tests/auth/index.yaml",
    "dryRun": false
  }
}
```

Failure shape:

```json
{
  "ok": false,
  "command": "suite create",
  "error": {
    "message": "ID already exists: auth",
    "details": ["tests/auth/index.yaml"]
  }
}
```

## Troubleshooting

### `ID already exists`

- IDs are unique across YAML files under the search root.
- Use `tlog suite list` / `tlog case list` to find conflicts.

### `... not found`

- Confirm your `--dir` or `--suite-dir` path.
- Default root is `tests` for most commands.

### Validation errors on update

- `suite update` and `case update` validate before writing.
- Check reported `path: message` details and retry.

## Version

```bash
tlog --version
```
