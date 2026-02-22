# AGENTS.md

## 目的
このリポジトリは、テスト管理ツール `tlog` を提供する。
`tlog` は以下の提供形態を持つ予定とする。

- VS Code 拡張
- CLI
- MCP

## 製品概要
`tlog` は README の方針に沿い、YAML を中心としたテスト管理を行う。
主な対象は以下とする。

- テストスイートの構成管理
- 実行ステータス・進捗の追跡
- 課題（Issue）管理
- MCP を通じた AI 支援

## 技術方針
主要な実装言語として TypeScript を採用する。
VS Code 拡張、CLI、MCP の各実装は、原則として TypeScript を前提に設計・実装すること。

## リポジトリ構造方針
リポジトリは、上記の提供予定に合わせたディレクトリ構造を維持する。
少なくとも以下の責務境界を明確に分離すること。

- VS Code 拡張の実装領域
- CLI の実装領域
- MCP の実装領域
- 複数領域で共有する共通ロジック

### 標準ディレクトリ構成
以下の構成を標準とし、この責務境界を維持すること。

```text
.
├─ packages/
│  ├─ cli/                # npm: @tlog/cli (global install target)
│  │  ├─ bin/
│  │  ├─ src/
│  │  └─ tests/
│  ├─ mcp/                # npm: @tlog/mcp (npx execution target)
│  │  ├─ src/
│  │  └─ tests/
│  ├─ vscode-extension/   # VS Code extension implementation
│  │  ├─ media/
│  │  ├─ src/
│  │  └─ tests/
│  └─ shared/             # shared TypeScript logic
│     └─ src/
├─ configs/               # shared config templates
└─ scripts/               # repository utility scripts
```

### CI/CD 構成
GitHub Actions を利用し、以下のワークフローを維持すること。

- `.github/workflows/ci.yml`
  - pull request / main push 時に `typecheck` `build` `test` を実行
- `.github/workflows/release.yml`
  - changesets 前提で version PR 作成および公開を実行
  - npm 公開（CLI/MCP）と VS Code 拡張公開を同一フローで管理

### VS Code 拡張の開発運用
- VS Code 拡張の公開管理は `@vscode/vsce` を利用すること。
- 拡張のひな形作成・再生成には以下コマンドを利用できる状態を維持すること。
  - `npx --package yo --package generator-code -- yo code`

## プロジェクトルール
本プロジェクトでは以下を禁止する。

- `rm` コマンドの使用
- セキュリティを脅かす行為

常に安全で監査可能な、非破壊的な運用を優先すること。
