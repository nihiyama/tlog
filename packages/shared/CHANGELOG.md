# @tlog/shared

## 0.3.1

### Patch Changes

- 65604c6: - **Suites pane status icon colors**
  - Color-code Suites pane case and suite icons by aggregated test execution status.
  - **Suite Burndown count synchronization**
    - Keep Suite Burndown counts synchronized with the active search filters and the inherited Suite/Case test scope.
    - Use the shared Burndown engine as the single source of truth for scoped totals, status counts, completed and remaining counts, progress rate, and daily remaining series.
    - Count `status: done` cases in KPI values even when `completedDay` is unset or outside the scheduled period, while folding out-of-range completions into the chart boundary buckets.
    - Include ancestor Suite tags in Case searches without leaking inherited tags into editable Case data.
    - Exclude Cases beneath an ancestor Suite with `scoped: false`, and show an explicit no-target state when no scoped Cases match.
    - Apply the same recursive scope, active filters, and real completion dates to the Suite statistics command.
  - **TLog Manager explicit save**
    - Replace debounce-based auto-save with a VS Code Custom Text Editor.
    - Support explicit save, configured Auto Save, native dirty and close protection, and standard undo/redo.
    - Open one YAML file per TLog Manager tab.
  - **Japanese localization and control pane refinements**
    - Add Japanese translations for VS Code contributions, runtime notifications and prompts, and TLog Webviews, while retaining English as the default and fallback language.
    - Keep YAML fields, command IDs, configuration keys, and other machine-readable identifiers unchanged across languages.
    - Document supported languages, VS Code language switching, translation maintenance, and verification procedures.
    - Improve Webview rendering performance by skipping DOM translation when no localized strings differ and by avoiding duplicate mutation traversal during Japanese localization.
    - Reduce the font size and padding of the Set Root, Browse, Apply, and Clear all filters buttons in the control pane.

## 0.3.0

### Minor Changes

- 577aac0: Release v0.3.0 across shared, CLI, MCP, and VS Code extension.

  This release includes search/filter consistency improvements, Suite Burndown enhancements, suite tree UX updates, and related fixes/features.

## 0.2.0

### Minor Changes

- 6a852c7: Release v0.2.0.

  Highlights:
  - Improved VS Code owners filtering to match suite owners, case owners, and issue owners from the Controls pane.
  - Stabilized case YAML field order so `owners` is written immediately after `tags`.
  - Fixed VSIX packaging flow to build latest extension sources before packaging.
  - Polished suites controls/icons and related UI behavior updates delivered in recent issue fixes.

## 0.1.1

### Patch Changes

- 813761b: Release fixes for owner persistence and MCP runtime compatibility across shared packages.
  - `@tlog/shared`: include schema/domain updates required by the owner persistence and MCP compatibility fixes.
  - `@tlog/cli`: align CLI behavior with the latest shared schema/runtime updates in this release.
  - `vscode-tlog`: fix unreliable persistence of `owners` values when editing test data (suite-level owners, case-level owners, and issue-level owners).
  - `@tlog/mcp`: fix runtime failure after global install (`npm install -g @tlog/mcp`) where MCP clients can list prompts/resources but fail on `listTools` with `Cannot read properties of undefined (reading '_zod')`.
