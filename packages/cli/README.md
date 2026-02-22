# @tlog/cli

`tlog` の YAML-first テスト管理 CLI です。

## Install

```bash
npm install -g @tlog/cli
```

## Commands

```bash
tlog init [--template <dir>] [--output <dir>] [--dry-run] [--json]
tlog template [--from <dir>] [--output <dir>] [--dry-run] [--json]

tlog suite create --id <id> --title <title> [--dir <dir>] [--owners <a,b>] [--tags <a,b>]
tlog suite list [--dir <dir>] [--id <pattern>] [--format text|json|csv] [--output <path>]

tlog case create --suite-dir <dir> --id <id> --title <title> [--status <todo|doing|done|null>] [--tags <a,b>]
tlog case list [--dir <dir>] [--id <pattern>] [--tag <tag>] [--status <todo|doing|done|null>] [--format text|json|csv] [--output <path>]

tlog validate [--dir <dir>] [--fail-on-warning] [--format text|json]
tlog list templates [--dir <dir>] [--format text|json|csv] [--output <path>]
```

## Global Options

- `--dry-run`: ファイル書き込みなしで実行結果を表示
- `--json`: 共通 JSON 形式で出力
- `--yes`: 対話確認をスキップ（将来の対話導線向け）

## JSON Output

成功時:

```json
{
  "ok": true,
  "command": "suite create",
  "data": {
    "id": "suite-a",
    "path": "tests/suite-a-suite-a/index.yaml",
    "dryRun": false
  }
}
```

失敗時:

```json
{
  "ok": false,
  "command": "suite create",
  "error": {
    "message": "ID already exists: suite-a",
    "details": ["tests/suite-a-suite-a/index.yaml"]
  }
}
```
