---
name: typescript-cli-commander-dev
description: TypeScript で commander を使った CLI を設計・実装・テスト・配布するときに使う skill。`tlog init` や `tlog suite create` などのコマンド設計、引数/オプション検証、非対話実行、JSON 出力、終了コード設計、shared 再利用方針を含む CLI 開発依頼で使用する。
---

# TypeScript CLI Commander Development Guide

この skill は、`commander` を使った TypeScript CLI を安全に実装する。

## Workflow

1. `AGENTS.md` と `steering/` の要件を読む。
   - 仕様・設計は `steering/` 配下を正とする。
   - `rm` を使わず、非破壊運用を優先する。
2. CLI 要件を確定する。
   - 対象コマンド、必須引数、オプション、終了コードを定義する。
   - 非対話運用 (`--yes`) と機械可読出力 (`--json`) の要否を決める。
3. コマンド構造を設計する。
   - `command group` を先に決める。例: `template`, `suite`, `case`。
   - コマンド名と責務を 1 対 1 に保つ。
4. 実装する。
   - `Command` のルートを 1 つ作り、サブコマンドを分割登録する。
   - オプション値は action 前に正規化・検証する。
   - エラーは例外を握りつぶさず、メッセージと終了コードを返す。
5. shared を優先利用する。
   - YAML 型、バリデータ、slug 命名、ID 解決は `packages/shared` を使う。
   - CLI 側で重複実装しない。
6. テストする。
   - 少なくとも `happy path` と `validation error` を各コマンドで確認する。
   - `--json` 出力と終了コードを検証する。
7. 仕上げる。
   - `--help` 文言と `README` のコマンド記述を一致させる。
   - 追加した仕様差分を `steering/` に反映する。

## Implementation Rules

- `commander` の `requiredOption` と独自検証を併用して入力不備を早期検知する。
- 破壊的な既定動作を避ける。上書きが必要なら明示オプションでのみ許可する。
- テキスト出力と JSON 出力は同一データモデルから生成する。
- list 系は仕様に合わせる。
  - `suite list`: `id`, `path`
  - `case list`: `id`, `status`, `path`
- ファイル命名は title slug、識別は YAML 内 `id` を正とする。

## Command Design Checklist

- コマンド名は動詞中心で曖昧さがない。
- `--dry-run` があるコマンドは書き込みを一切行わない。
- エラー時の終了コードが仕様どおり。
- `--json` の出力形式が全コマンドで一貫している。
- `stdout` は結果、`stderr` はエラー/警告を優先する。

## References

- commander の仕様と一次情報は `references/official-resources.md` を参照する。

