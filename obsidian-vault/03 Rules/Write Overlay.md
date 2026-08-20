---
tags: [rule]
---

# Write Overlay

`store.js` implements a read-through overlay: on read, an overlay hit returns the user's value; otherwise the generator returns the derived value. Writes land in `localStorage` keyed by the same identity the generator uses — `studentId|date|period` for attendance, `studentId|term|subject` for marks.

Consequences: edits survive a reload and win over the baseline; the whole demo occupies a few kilobytes however much is derived; "Reset demo data" is a single key deletion, after which the baseline reappears byte-identical; export/import is a JSON round-trip of the deltas alone. Every write is also appended to an audit trail with the acting role, mirroring `dbo.AuditLog`.

In production this layer disappears entirely — EF6 reads and writes the same tables directly, and the read-through is the one thing unique to the twin.

## Related
- [[Browser Twin]]
- [[SQL Schema]]
- [[Production App]]
