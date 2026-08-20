---
tags: [inventory]
---

# Services

8 application services in `src/SchoolErp.Web/Services`, split across `AdmissionService.cs`, `BackupService.cs`, `ExamService.cs` (each its own file), and `SupportServices.cs` (which holds five services together).

| Service | Implements |
|---|---|
| `AdmissionService` | [[Student Identifiers]], [[Admissions Module]] |
| `BackupService` | [[Backups & Disaster Recovery]] |
| `ExamService` | [[Grading Engine]], [[Exams & Results Module]] |
| `ModuleService` | [[Module Switches]] |
| `AuditService` | [[Write Overlay]] |
| `NotificationService` | [[Notice Board Module]] |
| `AttendanceService` | [[Attendance Modes]] |
| `FeeService` | [[Fee Ledger]] |

## Related
- [[Production App]]
- [[Controllers]]
