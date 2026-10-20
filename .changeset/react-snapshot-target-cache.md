---
'@codebelt/classy-store': patch
---

Reuse guarded backing copies of frozen snapshots across React auto-tracked consumers. Large forms and lists avoid repeatedly scanning and copying the same snapshot array while each hook retains its own tracked reads. Reflective mutations of tracking targets are rejected, and mutable computed values remain uncached.
