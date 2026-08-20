---
tags: [rule]
---

# Attendance Modes

Chosen by the grade, not by a setting: `Grades.AttendanceMode` is `'Daily'` for KG–10 and `'Period'` for 11–12 (§6). The register is one screen that grows a period selector when the selected class is in the college section.

The clustered key on `dbo.Attendance` is `(StudentId, Date, Period)`, because the hottest query is "this student's year" — the portal, the eligibility check, and the report card all ask it. The register asks the transposed question, which a covering index on `(Date, Period)` serves.

Late counts as present in the percentage — the board measures presence, not punctuality. The 70% threshold is a hard flag, not a statistic.

## Related
- [[§6 Attendance]]
- [[Domain Specification]]
- [[Domain Library]]
- [[SQL Schema]]
- [[Attendance Module]]
- [[Services]]
