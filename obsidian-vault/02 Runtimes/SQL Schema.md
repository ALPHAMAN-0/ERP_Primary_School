---
tags: [runtime]
---

# SQL Schema

`database/schema.sql` (1,168 lines) — 44 tables, 3 views, 2 stored procedures, EF6-compatible, `NVARCHAR` throughout for Bangla (§13), `DECIMAL` for money, zero binary columns anywhere (§14 — file paths are stored instead), and indexes chosen for the queries the screens actually issue.

Two things are procedures rather than constraints, because a constraint cannot express them:
- **`usp_AllocateStudentId`** — takes `UPDLOCK, HOLDLOCK` on the month's counter row so two clerks admitting simultaneously cannot be handed the same identifier.
- **`usp_ComputeTermResult`** — the §7 grading rules in T-SQL, including the fail rule, the 4th-subject bonus, and GPA truncation.

Results are stored rather than derived on read — `dbo.TermResults` holds computed GPAs — because recomputing 3,000 results per page view is not affordable on 256MB of dedicated RAM.

## Related
- [[Database Tables]]
- [[Stored Procedures]]
- [[Production App]]
- [[Grading Engine]]
- [[Student Identifiers]]
- [[Known Limits]]
