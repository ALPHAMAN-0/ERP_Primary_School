---
tags: [inventory]
---

# Stored Procedures

Two procedures exist because a constraint alone can't express what they do:

- **`usp_AllocateStudentId`** — takes `UPDLOCK, HOLDLOCK` on the month's counter row so two clerks admitting simultaneously can't be handed the same identifier. See [[Student Identifiers]].
- **`usp_ComputeTermResult`** — the §7 grading rules written in T-SQL: the fail rule, the 4th-subject bonus, GPA truncation. See [[Grading Engine]].

## Related
- [[SQL Schema]]
- [[Database Tables]]
