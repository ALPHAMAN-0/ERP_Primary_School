---
tags: [runtime]
---

# Domain Library

`src/SchoolErp.Domain` is a netstandard2.0 project holding the production-side rules, independent of any web framework: `GradeScale.cs` and `ResultCalculator.cs` (`Grading/`), `AttendanceCalculator.cs` (`Attendance/`), `FeeCalculator.cs` (`Fees/`), `StudentIdentifier.cs` (`Identity/`), and `BanglaFormatter.cs` plus `AcademicCalendar.cs` (`Common/`).

It references no `System.Web`, no EF, and no storage. Because `netstandard2.0` is referenceable from .NET Framework 4.8, `SchoolErp.Web` consumes it directly — and because it has no OS-specific dependency, it also compiles and tests on any platform. That portability is why the grading engine is verified rather than merely asserted, even though the web tier could not be compiled during this build (see [[Known Limits]]).

99 xUnit tests live in the sibling `SchoolErp.Domain.Tests` project (targeting net9.0) and all currently pass.

## Related
- [[Production App]]
- [[Grading Engine]]
- [[Attendance Modes]]
- [[Fee Ledger]]
- [[Student Identifiers]]
- [[Bangla Language Support]]
- [[Verification & Testing]]
