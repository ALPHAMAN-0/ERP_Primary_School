---
tags: [module]
---

# Attendance Module

On by default at launch (§4, §16). Implements the two-mode attendance rule from §6: daily attendance for KG–10, period-wise/subject-wise attendance for classes 11–12, which is what HSC board eligibility is actually assessed on.

Production side: `AttendanceController`, backed by `AttendanceService`. Browser-twin side: `attendance.js`. The register screen grows a period selector automatically when the selected class belongs to the college section.

Touches the `Attendance` table, clustered on `(StudentId, Date, Period)`.

## Related
- [[Attendance Modes]]
- [[§6 Attendance]]
- [[§16 Modules Included]]
- [[Controllers]]
- [[Services]]
