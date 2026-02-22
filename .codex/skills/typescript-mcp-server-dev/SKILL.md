---
name: typescript-mcp-server-dev
description: TypeScript で MCP サーバを設計・実装・検証するときに使う skill。公式ドキュメントと公式リポジトリをインターネットで確認し、最新の仕様/SDKに合わせてサーバ構築、接続設定、デバッグ、公開準備まで進める。
---

# TypeScript MCP Server Development Guide

この skill は、TypeScript で MCP サーバを安全に実装し、クライアント接続まで完了させる。

## Workflow

1. `AGENTS.md` と `steering/` の要件を読む。
   - 仕様・設計は `steering/` 配下を正とする。
   - TypeScript 前提の実装方針と責務境界に従う。
2. 公式情報をオンラインで確認する。
   - `references/official-sources.md` を先に確認する。
   - MCP 仕様の stable revision、`@modelcontextprotocol/sdk` の最新版、TypeScript quickstart を確認する。
3. SDK バージョンを確定する。
   - `npm view @modelcontextprotocol/sdk version`
   - `npm view @modelcontextprotocol/sdk dist-tags --json`
   - 根拠を残して依存バージョンを固定する。
4. サーバを実装する。
   - `McpServer` を生成し `name` / `version` を定義する。
   - `registerTool` と `zod` で入力スキーマを明示する。
   - 生成・検証・命名の共通処理は `packages/shared` を優先利用する。
5. transport を選定する。
   - ローカル連携は `stdio` を優先する。
   - リモート公開は `Streamable HTTP` を優先し、SSE は互換要件時のみ検討する。
6. 検証する。
   - `npm run build`
   - MCP Inspector で `tools/resources/prompts` の列挙と実行を確認する。
   - 不正入力・タイムアウト・外部 API エラーを最低 1 件ずつ確認する。
7. 仕上げる。
   - 接続設定例を提示する。
   - 変更した仕様差分を `steering/` に反映する。

## Implementation Rules

- STDIO 利用時は `stdout` を JSON-RPC 用に保ち、ログは `stderr` へ出力する。
- tool の入力/出力契約を曖昧にしない。スキーマと戻り値形式を一致させる。
- `write=false` で非破壊実行できる設計を優先する。
- ワークスペース外への意図しない書き込みを禁止する。
- 公式情報から外れる推奨をする場合は、理由とリスクを必ず明示する。

## MCP Design Checklist

- 実装前にオンラインで最新仕様を確認した。
- SDK バージョン選定理由を記録した。
- `stdout` 汚染がない (STDIO 利用時)。
- Inspector で主要ツールの実行確認を完了した。
- transport 選定理由を説明できる。
- エラー時の `result/error` 応答が一貫している。

## References

- 公式ソースは `references/official-sources.md` を参照する。
- 実装テンプレートは `references/typescript-server-template.md` を参照する。
- 調査チェックリストは `references/latest-checklist.md` を参照する。
