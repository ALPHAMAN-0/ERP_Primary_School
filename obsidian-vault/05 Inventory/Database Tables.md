---
tags: [inventory]
---

# Database Tables

The 44 tables of `database/schema.sql`, grouped into 9 clusters (the schema also defines 3 views and 2 stored procedures — see [[Stored Procedures]]).

- **Identity & Access:** `Users`, `Roles`, `UserRoles`, `Employees` → [[Authentication & Security]], [[HR & Payroll Module]]
- **Academic Structure:** `AcademicYears`, `Grades`, `ClassSections`, `Groups`, `Subjects`, `CurriculumSubjects` → [[§5 Academic Structure]]
- **Students & Admissions:** `Students`, `Enrolments`, `Guardians`, `StudentIdSequence` → [[Student Identifiers]], [[Admissions Module]]
- **Attendance:** `Attendance` → [[Attendance Modes]]
- **Exams & Grading:** `ExamTerms`, `Marks`, `TermResults`, `GradeScale` → [[Grading Engine]]
- **Fees:** `FeeHeads`, `FeeStructures`, `Invoices`, `InvoiceLines`, `Payments`, `Waivers` → [[Fee Ledger]]
- **Notices & Notifications:** `Notices`, `NotificationQueue` → [[Notice Board Module]]
- **Facilities:** `Books`, `BookCopies`, `BookLoans`, `Routes`, `RouteStops`, `Vehicles`, `TransportAssignments`, `HostelBlocks`, `HostelRooms`, `HostelAllocations` → [[Library Module]], [[Transport Module]], [[Hostel Module]]
- **Operations:** `PayrollRuns`, `Payslips`, `AuditLog`, `BackupLog`, `AppSettings`, `ModuleSettings`, `RoutineSlots` → [[Settings & System Health]], [[Backups & Disaster Recovery]], [[Module Switches]]

## Related
- [[SQL Schema]]
- [[Stored Procedures]]
