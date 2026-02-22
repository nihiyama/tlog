---
name: typescript-vscode-extension
description: TypeScript を使って VS Code 拡張機能を設計・実装・テスト・配布するときに使う skill。新規拡張の初期化、package.json の contributes/activationEvents 設計、コマンド実装、Web 拡張対応、@vscode/test-electron によるテスト、@vscode/vsce による VSIX 化や公開を行う依頼で使用する。
---

# TypeScript VS Code Extension Guide

TypeScript で VS Code 拡張を開発するための実践手順を定義する。

## Workflow

1. `AGENTS.md` と `steering/` の要件を読む。
   - 仕様・設計は `steering/` 配下を正とする。
   - TypeScript 前提の実装方針と責務境界に従う。
2. 要件を確定する。
   - 拡張種別を決める: `commands` / 言語機能 / テーマ / テスト連携 / Webview / Web Extension。
   - 対応ランタイムを決める: Node 拡張 (`main`) か Web 拡張 (`browser`) か。
3. 最小スキャフォールドを作る。
   - 既存プロジェクトに組み込む場合は、`src/extension.ts`、`package.json`、`tsconfig.json`、`.vscode/launch.json` を最小構成で作成する。
   - 必要時のみジェネレーターを使う（例: `yo code`）。
4. `package.json` を先に固める。
   - 必須: `name`, `publisher`, `version`, `engines.vscode`, `main` または `browser`。
   - 主要: `contributes`, `activationEvents`, `categories`, `scripts`。
   - `contributes.commands` と実装コマンドIDを一致させる。
5. エントリポイントを実装する。
   - `activate(context)` で `vscode.commands.registerCommand` などを登録する。
   - 破棄が必要なリソースは `context.subscriptions` に登録する。
   - 不要なら `deactivate` は省略可。
6. TypeScript 設定を厳格に保つ。
   - `tsconfig.json` で `strict: true` を基本にする。
   - `outDir` と `rootDir` を明示し、ビルド出力を分離する。
7. shared を優先利用する。
   - YAML 型、バリデーション、ID 解決、統計計算は `packages/shared` を優先利用する。
   - 拡張側で重複実装しない。
8. テストを実装する。
   - 拡張ホスト統合テストは `@vscode/test-electron` を使う。
   - コマンドや provider はユニットテスト可能な形で分離する。
9. 配布手順を整える。
   - ローカル配布: `@vscode/vsce` で `vsce package`。
   - 公開: `vsce publish`。CI では `VSCE_PAT` をシークレット管理する。
10. Web 対応が必要なら制約を確認する。
   - Web 拡張では Node.js API 非依存にする。
   - `package.json` の `browser` エントリを定義する。
11. 仕上げる。
   - `README` の操作説明と実装コマンドを一致させる。
   - 変更した仕様差分を `steering/` に反映する。

## Implementation Rules

- コマンドIDは `publisherOrDomain.feature.action` 形式で命名する。
- 初期実装は「1コマンド + 1ユースケース」から始める。
- activation は必要最小限にし、重い初期化を避ける。
- ユーザー向け文言は `README.md` とコマンドタイトルで整合させる。
- 例外は握りつぶさず、`window.showErrorMessage` またはログ出力で可視化する。
- View/Edit を中心にし、生成・検証の中核ロジックは shared に寄せる。

## VSCode Design Checklist

- `engines.vscode` が対象バージョン帯と一致している。
- `contributes.commands` の command ID と `registerCommand` の ID が一致している。
- `activationEvents` は過不足なく、不要な `*` を使っていない。
- `npm run compile` とテストが通る。
- `vsce package` で VSIX 作成が成功する。
- 仕様や設計に関するドキュメントは `steering/` 配下へ配置している。

## References

- 公式情報は `references/official-resources.md` を参照する。
