---
tags: [runtime]
---

# Production App

`src/SchoolErp.Web` — ASP.NET MVC 5 on .NET Framework 4.8, Razor views, Entity Framework 6, Hangfire for background jobs, Bootstrap 5 for the UI (§2).

**Three-project split**, and why it exists:

| Project | Target | Why |
|---|---|---|
| `SchoolErp.Domain` | netstandard2.0 | The rules — GPA, identifiers, attendance, fees. No `System.Web`, no EF, no storage. |
| `SchoolErp.Domain.Tests` | net9.0 + xUnit | 99 tests, all passing. |
| `SchoolErp.Web` | net48 | Controllers, Razor views, EF6, Hangfire. |

Pieces worth naming individually:
- **`RequireModuleAttribute`** — enforces the §4 module switches at the controller boundary. Hiding a nav link is decoration; this is the gate. An Admin still gets through, to a page offering the switch.
- **`AdmissionService`** — allocates identifiers through `usp_AllocateStudentId` inside a serializable transaction, so a failed insert rolls the serial back with it rather than burning a number.
- **`ExamService`** — fetches marks, hands them to the shared `ResultCalculator`, and stores the result. It contains no grading logic of its own.
- **`NotificationService`** — email delivered via `SmtpClient` (the provider is a `Web.config` change); SMS is written to a held queue with its cost recorded.
- **`AccountController`** — PBKDF2 with the iteration count stored alongside the hash, constant-time comparison, and one identical failure message for every rejection so guardian phone numbers can't be enumerated.

## Related
- [[Controllers]]
- [[Services]]
- [[Domain Library]]
- [[SQL Schema]]
- [[Authentication & Security]]
- [[Module Switches]]
- [[Known Limits]]
