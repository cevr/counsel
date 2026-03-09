---
"@cvr/counsel": patch
---

Simplify `counsel` output by printing preview and result payloads directly to stdout, writing run artifacts under `/tmp/counsel`, and tightening the live invocation runner around Effect `Clock` and `callback`.
