---
"vscode-tlog": minor
"@tlog/shared": patch
---

- **Suites pane status icon colors**
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
