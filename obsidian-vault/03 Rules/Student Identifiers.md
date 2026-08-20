---
tags: [rule]
---

# Student Identifiers

Format `YYMMSSSS`: a 2-digit year, 2-digit zero-padded month, and a 4-digit serial scoped to that month — up to 9,999 admissions per month. Identifiers are never reused, even after graduation or withdrawal.

In the browser twin, the serial counter is monotonic: `Math.max(stored, baselineUsed) + 1`. It never rewinds, so deleting a student cannot free their number.

In SQL, `StudentId` is the primary key of `dbo.Students`, and `dbo.StudentIdSequence` holds one monotonic counter per `YYMM` bucket. `usp_AllocateStudentId` takes `UPDLOCK, HOLDLOCK` on that row inside a transaction — the only thing that stops two clerks admitting simultaneously from being handed the same identifier. `AdmissionService` wraps the call in a serializable transaction, so a failed insert rolls the serial back with it rather than burning a number.

## Related
- [[§8 Student Identity & Admissions]]
- [[Domain Specification]]
- [[Domain Library]]
- [[SQL Schema]]
- [[Stored Procedures]]
- [[Admissions Module]]
- [[Services]]
