---
tags: [inventory]
---

# Controllers

11 ASP.NET MVC controllers in `src/SchoolErp.Web/Controllers`, split across `AccountController.cs`, `BaseController.cs`, `ExamsController.cs`, `StudentsController.cs` (each its own file), and `RemainingControllers.cs` (which holds seven controllers together).

| Controller | Implements |
|---|---|
| `BaseController` | Shared base class — no own view |
| `AccountController` | [[Authentication & Security]] |
| `HomeController` | [[School College ERP]] |
| `AdmissionsController` | [[Admissions Module]] |
| `AttendanceController` | [[Attendance Module]] |
| `ExamsController` | [[Exams & Results Module]] |
| `FeesController` | [[Fees & Accounts Module]] |
| `NoticesController` | [[Notice Board Module]] |
| `PortalController` | [[Parent Portal Module]] |
| `SettingsController` | [[Settings & System Health]] |
| `StudentsController` | [[Student Profiles Module]] |

No controller exists yet for Class Routine, Library, Transport, HR/Payroll, or Hostel — see [[Known Limits]].

## Related
- [[Production App]]
- [[Services]]
- [[Known Limits]]
