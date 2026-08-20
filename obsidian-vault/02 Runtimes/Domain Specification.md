---
tags: [runtime]
---

# Domain Specification

`docs/assets/js/core/spec.js` is the single source of truth for the browser twin — data, not logic: `GRADE_SCALE` (§7), the `STUDENT_ID` format (§8), `ROLES` (§9), `MODULES` and their defaults (§4), `FEE_HEADS`/`TUITION_BY_LEVEL` (§11), `GRADES`/`SUBJECTS_BY_STAGE` (§5), and `ATTENDANCE` modes plus threshold (§6). Being pure data with no logic is what makes it portable to a C# constant class or a SQL seed script without translation.

Each spec constant has a twin-side consumer and a production-side consumer:

| Spec constant | Consumed by the twin | Consumed by production |
|---|---|---|
| `GRADE_SCALE` | `computeResult()` in `domain.js` | `dbo.GradeScale` + `usp_ComputeTermResult` |
| `STUDENT_ID` format | `makeStudentId()` | `usp_AllocateStudentId` + `CK_Students_Id` |
| `ROLES` | route allow-list in `auth.js` | `dbo.Roles` + `[Authorize(Roles=…)]` |
| `MODULES` + defaults | navigation filter | `dbo.ModuleSettings` |
| `FEE_HEADS`, `TUITION_BY_LEVEL` | `studentLedger()` | `dbo.FeeHeads`, `dbo.FeeStructures` |
| `GRADES`, `SUBJECTS_BY_STAGE` | `subjectsFor()` | `dbo.Grades`, `dbo.CurriculumSubjects` |
| `ATTENDANCE` modes + threshold | `attendanceModeOf()` | `Grades.AttendanceMode`, `vw_AttendanceSummary` |

When the board revises a grade band, one table changes and both runtimes follow.

## Related
- [[Grading Engine]]
- [[Student Identifiers]]
- [[Roles & Permissions]]
- [[Module Switches]]
- [[Fee Ledger]]
- [[Attendance Modes]]
- [[Browser Twin]]
- [[§4 Feature Toggle System]]
- [[§5 Academic Structure]]
- [[§6 Attendance]]
- [[§7 Grading & Results]]
- [[§8 Student Identity & Admissions]]
- [[§9 Roles & Permissions]]
- [[§11 Fees]]
