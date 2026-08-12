# Architecture

How the browser twin in `docs/` and the SQL Server schema in `database/` stay in step, and why each of the load-bearing decisions was made.

---

## 1. One spec, two runtimes

The requirements fix the production stack: ASP.NET MVC 5, Razor, SQL Server, Entity Framework 6, hosted on MonsterASP's free tier (§2, §3). GitHub Pages cannot execute any of that.

The usual answer is a clickable prototype — screenshots wired together, no real rules behind them. That fails the interesting test: a prototype cannot tell you whether one F really does collapse a GPA, whether a route can be overfilled, or what SMS would cost at this roll size.

So instead there is a **domain specification** — `docs/assets/js/core/spec.js` — that both runtimes are built from:

| Specified once | Consumed by the twin | Consumed by production |
|---|---|---|
| `GRADE_SCALE` (§7) | `computeResult()` in `domain.js` | `dbo.GradeScale` + `usp_ComputeTermResult` |
| `STUDENT_ID` format (§8) | `makeStudentId()` | `usp_AllocateStudentId` + `CK_Students_Id` |
| `ROLES` (§9) | route allow-list in `auth.js` | `dbo.Roles` + `[Authorize(Roles=…)]` |
| `MODULES` + defaults (§4) | navigation filter | `dbo.ModuleSettings` |
| `FEE_HEADS`, `TUITION_BY_LEVEL` (§11) | `studentLedger()` | `dbo.FeeHeads`, `dbo.FeeStructures` |
| `GRADES`, `SUBJECTS_BY_STAGE` (§5) | `subjectsFor()` | `dbo.Grades`, `dbo.CurriculumSubjects` |
| `ATTENDANCE` modes + threshold (§6) | `attendanceModeOf()` | `Grades.AttendanceMode`, `vw_AttendanceSummary` |

When the board revises a grade band, one table changes and both runtimes follow. The spec file is data, not code — it contains no logic, which is what makes it portable to a C# constant class or a seed script without translation.

**The pure core.** `domain.js` touches neither the DOM nor storage. Every function in it maps one-to-one onto a method on a C# domain service:

```
computeResult(subjects, marks)   →  ResultCalculator.Compute(IEnumerable<SubjectMark>)
makeStudentId(date, serial)      →  StudentIdAllocator.Format(DateTime, int)
summariseAttendance(records)     →  AttendanceService.Summarise(IEnumerable<Attendance>)
tuitionFor(gradeId)              →  FeeService.MonthlyTuition(GradeId)
```

That is the seam. Everything above it is presentation; everything below it is storage; the rules in the middle are the same rules on both sides.

---

## 2. Deriving the roster instead of storing it

### The problem

§1 sets the scale at 3,000+ students. Materialising that for a demo means:

| Entity | Rows |
|---|---|
| Students | ~3,200 |
| Attendance (220 working days) | ~700,000 |
| Marks (11 subjects × 4 terms) | ~140,000 |
| **Total** | **~850,000** |

As JSON that is tens of megabytes over the wire before the first paint.

### The approach

Nothing is stored. Everything is a pure function of a string seed, through a 32-bit FNV-1a hash feeding a Mulberry32 generator (`rng.js`):

```js
attendanceFor(student, date, period)
  → rand(`${student.id}|${dateIso}|${period}`)
  → compared against the student's latent `diligence`
  → 'P' | 'A' | 'L' | 'E'
```

Because the key contains everything the value depends on, the same student on the same day yields the same status in any browser, on any machine, on any day — with no coordination and no storage.

### Why it looks real rather than random

Flat randomness would make every class statistically identical and every student mediocre. Three properties fix that:

1. **One latent ability per student**, drawn from a bell curve, drives every mark they will ever get. A strong student is consistently strong — across subjects and across terms.
2. **A high-achiever cohort.** A single normal curve produces a school where nobody fails *and* nobody reaches GPA 5.00, because both outcomes require a run of consistent results across eight subjects. 14% of students carry a boost, which is what lands the GPA-5 rate at 7.7% and the fail count at 70 — figures a real institution reports.
3. **Tight per-subject variance.** Affinity and noise are small relative to ability, so consistency survives to the aggregate.

Attendance follows the same idea: a per-student `diligence`, correlated with but not identical to ability, plus a small weekly rhythm (Thursday, the last working day, runs thinner).

### Cost

| Operation | Time |
|---|---|
| Generate 3,158 students + families | 36 ms |
| One class's results for a term | 1 ms |
| Institution-wide attendance for a day | 3 ms |
| Institution-wide fee roll-up (3,158 ledgers) | 8 ms |
| 8-month attendance trend | 120 ms |

Only the last is sampled — every fourth student, at a fixed stride so the series never jitters between paints. Everything else is exact.

---

## 3. The overlay

Derived data is read-only by nature, but an ERP is defined by its writes. `store.js` resolves this with a read-through overlay:

```
read  →  overlay hit?  ──yes──►  return the user's value
             │
             no
             ▼
         generator  ──────────►  return the derived value
```

Writes land in `localStorage` keyed by the same identity the generator uses — `studentId|date|period` for attendance, `studentId|term|subject` for marks. Consequences:

- Edits survive a reload and win over the baseline.
- The whole demo occupies a few kilobytes, however much is derived.
- *Reset demo data* is one key deletion; the baseline reappears byte-identical.
- Export/import is a JSON round-trip of the deltas alone.

Every write is also appended to an audit trail with the acting role, mirroring `dbo.AuditLog`.

In production this layer disappears: EF6 reads and writes the same tables, and the read-through is the one thing unique to the twin.

---

## 4. Rules worth their own section

### §7 — the grading engine

Four rules, all in `computeResult()` and mirrored in `usp_ComputeTermResult`:

1. Marks normalise against the subject's full mark before the band lookup, so a 200-mark HSC paper grades on the same scale as a 100-mark one.
2. **A fail in any compulsory subject fails the whole result.** GPA publishes as 0.00, letter F, regardless of the other grades. In SQL this is additionally a `CHECK` constraint — `HasFailed = 0 OR Gpa = 0` — so the invariant cannot be violated even by a bad write.
3. **The optional 4th subject** is excluded from the divisor; its grade points above 2.00 are added as a bonus; a fail in it is harmless.
4. **GPA is truncated, not rounded**, then capped at 5.00.

The mark-entry screen recomputes rule 2 on every keystroke, so the consequence of a mark is visible while it is being typed rather than discovered at tabulation.

### §8 — permanent identifiers

`YYMMSSSS`: two-digit year, two-digit month, four-digit serial scoped to that month — 9,999 admissions a month.

The requirement that they are *never reused* is enforced structurally rather than by convention:

- **In the twin,** the serial counter is monotonic — `Math.max(stored, baselineUsed) + 1`. It never rewinds, so deleting a student cannot free their number.
- **In SQL,** `StudentId` is the primary key of `dbo.Students`, and `dbo.StudentIdSequence` holds one monotonic counter per `YYMM` bucket. `usp_AllocateStudentId` takes `UPDLOCK, HOLDLOCK` on that row inside a transaction, which is the only thing that stops two clerks admitting simultaneously from being handed the same identifier.

### §6 — two attendance modes

Chosen by the grade, not by a setting: `Grades.AttendanceMode` is `'Daily'` for KG–10 and `'Period'` for 11–12. The register is one screen that grows a period selector when the selected class is in the college section.

The clustered key on `dbo.Attendance` is `(StudentId, Date, Period)`, because the hottest query is "this student's year" — the portal, the eligibility check and the report card all ask it. The register asks the transposed question, which a covering index on `(Date, Period)` serves.

Late counts as present in the percentage: the board measures presence, not punctuality.

### §4 — module switches

Every module ships in the codebase; `ModuleSettings.IsEnabled` decides what the institution sees. Switching one affects three things at once: the navigation, the route guard, and fee billing — a head belonging to a switched-off module stops being billed. Core modules carry `IsCore`, and a `CHECK` constraint forbids disabling them.

Admin continues to see switched-off modules greyed out, so the switch stays discoverable; every other role simply doesn't see them.

---

## 5. Presentation

**No build step.** ES modules served directly. Nothing to install, nothing to compile, nothing that rots between now and the next time someone opens the repo.

**Escaped by default.** `ui.js` exports an `html` tagged template that escapes every interpolation; `raw()` is the deliberate opt-out. Student names, guardian names and free-text notices all flow through it, so a name containing `<` cannot become markup.

**Screens are `render` + `mount`.** `render(ctx)` returns markup and is a pure function of state — which is what makes all 14 screens testable headlessly under a DOM stub. `mount(root, ctx)` wires events after paint. Nothing else is imperative.

**Charts.** Colours come from a categorical palette validated for colour-vision deficiency against the actual light and dark surfaces (worst adjacent pair ΔE 9.2 deuteranopia / 24.0 normal vision, both clear of the floors). Single-series charts carry no legend; multi-series charts carry both a legend and direct labels, so identity is never colour alone. Grade bands use an ordinal single-hue ramp and always print the letter beside the colour.

**Dark mode is selected, not inverted.** Both palettes are stepped for their own surface.

**Print is a first-class target.** Report cards, admit cards, receipts, payslips and tabulation sheets have real print styles — chrome hidden, page breaks set, margins in millimetres. These are documents the office actually prints.

---

## 6. Hosting constraints as a feature

§3 and §17 record the free tier honestly: 256 MB RAM, a 1 GB database, no custom domain, no uptime guarantee. Rather than filing these away, the system surfaces them.

**Settings → System Health** projects database growth from measured row widths and states how many years fit under the ceiling — a projection that only holds while §14's "no binaries in the database" rule does, which is why the schema has no `VARBINARY` column anywhere and stores file *paths* instead.

**The RAM ceiling shapes the schema.** `dbo.TermResults` stores computed GPAs rather than deriving them per request, because recomputing 3,000 results per page view on 256 MB is not affordable. Filtered indexes on the outstanding-invoice and pending-notification queues exist for the same reason.

**No uptime guarantee** is why the demo registers a service worker. Since the roster is derived rather than fetched, caching the code caches the entire dataset — the app works with no network at all.

---

## 7. What is deliberately absent

- **A wired payment gateway (§11).** The ledger, the receipt, the reports and `Payments.PaymentMethod` all carry the field already; only the provider is missing. Turning one on is an integration, not a migration.
- **A wired SMS gateway (§12).** The queue, the audience calculation, the cost estimate and the admin toggle are built. Nothing sends, because ৳0.30 a message with no free tier is ~৳18,000 a year at this roll size, and that is the institution's decision to make. The Notifications screen exists to give them the number.
- **Real authentication in the twin.** There are no credentials to hold client-side, which is exactly why the role switcher exists. Production uses ASP.NET Identity against `dbo.Users` and `dbo.UserRoles`.

Each of these is a seam left open on purpose, with the shape of the missing piece already defined.
