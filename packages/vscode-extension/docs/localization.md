# Localization Guide

TLog for Visual Studio Code supports English (`en`) and Japanese (`ja`). English is the source language and the fallback for unsupported locales and missing translations.

## Locale selection

The extension follows the VS Code display language. Users can switch languages with the VS Code `Configure Display Language` command and then restart VS Code or reload the window. TLog does not define a separate language setting.

## Localization files

| Surface                          | English source                                                        | Japanese translation       |
| -------------------------------- | --------------------------------------------------------------------- | -------------------------- |
| Views, commands, menus, settings | `package.nls.json`                                                    | `package.nls.ja.json`      |
| Extension-host messages          | English strings passed to `vscode.l10n.t` and `l10n/bundle.l10n.json` | `l10n/bundle.l10n.ja.json` |
| Controls and Manager Webviews    | `src/localization.ts` and English Webview text                        | `l10n/bundle.l10n.ja.json` |

`package.json` contains only localization placeholders for translated contribution labels. Command IDs, setting keys, Webview message types, YAML fields, enum values, and internal error codes remain language-independent.

## Translation-key conventions

- Manifest keys use a stable dotted name grouped by surface, such as `commands.openManager`, `views.controls`, and `configuration.scopeMode.description`.
- Runtime and Webview keys use the English source message expected by `vscode.l10n.t`.
- Parameterized runtime messages use indexed placeholders such as `{0}`; translators must retain every placeholder.
- Webview display labels may translate enum text, but the underlying HTML `value` remains the schema value (`todo`, `doing`, `done`, and so on).
- New user-facing text must not be embedded only in Japanese. Add the English source and Japanese translation together.

## Standard terminology

| English  | Japanese     |
| -------- | ------------ |
| Suite    | スイート     |
| Case     | ケース       |
| Issue    | Issue        |
| Status   | ステータス   |
| Owner    | 担当者       |
| Scoped   | スコープ対象 |
| todo     | 未着手       |
| doing    | 実行中       |
| done     | 完了         |
| open     | 未対応       |
| resolved | 解決済み     |
| pending  | 保留         |

Schema identifiers shown as editable field names are translated as labels only. Their serialized YAML names do not change.

## User-facing text inventory

| Area                       | In-scope text                                                                                       | Localization mechanism                         |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Activity Bar contributions | Controls and Suites view names                                                                      | `package.nls*.json`                            |
| Command Palette and menus  | Command titles, create/open/delete actions, expand/collapse actions                                 | `package.nls*.json`                            |
| Settings                   | `tlog.scopeMode` description                                                                        | `package.nls*.json`                            |
| Root selection             | Open-dialog title and button, invalid-root and selected-root status                                 | `vscode.l10n.t`                                |
| Creation flows             | Suite/Case ID and title prompts, validation errors, duplicate-ID errors, suite picker               | `vscode.l10n.t`                                |
| Tree                       | Initial guidance, missing-index guidance, load failures, create/open command titles, invalid marker | injected translator                            |
| Search                     | Controls labels, filter choices, active-filter chips, apply/clear status                            | Webview translation bridge and `vscode.l10n.t` |
| Manager header             | Save/Open YAML actions and saving, saved, unsaved, and failure states                               | Webview translation bridge                     |
| Suite editor               | Field labels, related editor, date ranges, remarks, suite cases and search                          | Webview translation bridge                     |
| Burndown                   | Chart title, accessible labels, KPIs, legend, empty/invalid-duration guidance                       | Webview translation bridge                     |
| Case editor                | Field labels, operations, tests, issues, list actions, status choices                               | Webview translation bridge                     |
| Navigation and deletion    | Related picker, missing-target errors, selection errors, delete confirmation                        | `vscode.l10n.t`                                |
| Accessibility              | User-facing `aria-label`, `title`, and `placeholder` attributes                                     | Webview translation bridge                     |

Diagnostic messages originating from the shared YAML validator are outside the translation ownership of the VS Code Extension. TLog UI text surrounding those diagnostics remains localized.

## Adding or updating a translation

1. Add or update the English source text.
2. For manifest contributions, update both `package.nls.json` and `package.nls.ja.json`.
3. For runtime text, wrap the English source with `vscode.l10n.t` and update both runtime bundles.
4. For Webview text, add the English source to `webviewMessages` (or the prefix list for a dynamic prefix) and update both runtime bundles.
5. Preserve command IDs, settings keys, schema values, placeholders, and Webview protocol fields.
6. Run:

```bash
npm run typecheck
npm run test
npm run build
npm run package:vsix
```

Tests verify that every inventoried Webview message exists in both bundles, Japanese strings are injected for `ja`, missing strings fall back to English, and manifest command IDs remain unchanged.
