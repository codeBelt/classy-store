---
"@codebelt/classy-store": patch
---

- ensure paused state update is deferred using queueMicrotask in history utils
- prevent arrow functions bypassing proxy traps, add error isolation for listeners