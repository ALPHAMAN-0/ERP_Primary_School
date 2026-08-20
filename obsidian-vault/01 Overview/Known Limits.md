---
tags: [overview]
---

# Known Limits

- **`SchoolErp.Web` has never been compiled.** It was written on macOS, where .NET Framework 4.8 and `System.Web` cannot be restored. The Domain layer it depends on *is* compiled and tested (99 assertions); the controllers, Razor views, and EF6 mapping are not — expect compile errors on the first Windows build, most likely in the Razor views.
- **`database/schema.sql` has never been executed.** No SQL Server was available during development.
- **No real authentication in the browser twin.** It runs entirely client-side, so there is no real credential store — the role switcher exists precisely because there is nothing to hold. Production uses ASP.NET Identity.
- **Attendance trend sampling.** Institution-wide attendance trend charts sample every fourth student to keep a full-year roll-up inside a frame budget. Everything else — the daily register, eligibility, results, ledgers — is computed exactly.
- **Google Drive backup upload is a deliberate seam.** It needs a service-account credential the institution must create. The export, compression, logging, and 30-day pruning around it are already written.
- **No production controller yet for four off-by-default modules, plus Class Routine.** `src/SchoolErp.Web/Controllers` has no `RoutineController`, `LibraryController`, `TransportController`, `HRController`, or `HostelController` — only the browser twin implements those screens today (`routine.js`, `library.js`, `transport.js`, `hr.js`, `hostel.js`).

## Related
- [[Production App]]
- [[SQL Schema]]
- [[Browser Twin]]
- [[Authentication & Security]]
- [[Backups & Disaster Recovery]]
- [[Class Routine Module]]
- [[Library Module]]
- [[Transport Module]]
- [[HR & Payroll Module]]
- [[Hostel Module]]
- [[Verification & Testing]]
