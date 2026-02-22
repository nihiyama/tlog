# Latest Info Checklist

## A. 仕様とSDK

- [ ] MCP spec の最新 release tag を確認した
- [ ] TypeScript SDK の最新 release tag を確認した
- [ ] Quickstart の TypeScript 例で API 形状を再確認した

## B. npm確認

- [ ] `npm view @modelcontextprotocol/sdk version`
- [ ] `npm view @modelcontextprotocol/sdk dist-tags --json`
- [ ] `npm view @modelcontextprotocol/sdk peerDependencies --json`

## C. transport設計

- [ ] local は stdio / remote は Streamable HTTP を検討した
- [ ] SSE を採用する場合は互換目的の理由を記録した

## D. 実装と検証

- [ ] `McpServer` の `name`/`version` を設定した
- [ ] `registerTool` と `inputSchema` を定義した
- [ ] STDIO時に `stdout` へログを出していない
- [ ] `npm run build` が成功した
- [ ] Inspector で少なくとも1つのtool実行を確認した

## E. 接続設定

- [ ] クライアント設定の実行コマンドを記載した
- [ ] 絶対パスを使用した
- [ ] OS差異 (特に Windows) を補足した
