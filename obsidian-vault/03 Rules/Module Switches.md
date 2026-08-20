---
tags: [rule]
---

# Module Switches

Every module ships in the codebase; `ModuleSettings.IsEnabled` decides what the institution actually sees (§4). Switching one on or off affects three things at once: the navigation, the route guard (`RequireModuleAttribute`), and fee billing — a fee head belonging to a switched-off module stops being billed. Core modules carry `IsCore`, and a `CHECK` constraint forbids disabling them.

Admin still sees switched-off modules greyed out, so the switch stays discoverable; every other role simply doesn't see them.

**On by default at launch:** Admissions, Student Profiles, Attendance, Exams/Results, Class Routine, Fees, Notice Board, Parent Portal.
**Off by default at launch:** Library, Transport, Hostel/Boarding, HR/Payroll.

## Related
- [[§4 Feature Toggle System]]
- [[Domain Specification]]
- [[Production App]]
- [[SQL Schema]]
- [[Settings & System Health]]
- [[Library Module]]
- [[Transport Module]]
- [[HR & Payroll Module]]
- [[Hostel Module]]
