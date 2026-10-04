---
"vscode-tlog": patch
---

Reduce suite loading latency by reusing one workspace traversal and parsed YAML model for tree filtering, Manager initialization, and statistics. Bound concurrent I/O, coalesce overlapping refreshes, release shared models after use, and reject stale results while preserving filtered suite status icons and existing editing behavior.
