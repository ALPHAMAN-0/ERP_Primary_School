# School & College ERP

A full ERP for a composite school-and-college institution — 3,000+ students, eight roles, twelve modules — built to the specification in [`school_college_erp_requirements.md`](school_college_erp_requirements.md).

**▶ Live demo: <https://alphaman-0.github.io/ERP_Primary_School/>**

No login needed. Use the role switcher in the bottom-left to sign in as any of the eight roles.

---

## The problem this repo solves twice

The requirements pin the production stack to **ASP.NET MVC 5 / SQL Server / EF6 on MonsterASP** (§2). GitHub Pages serves static files and cannot run a line of it. So a "live demo" of that system is, on the face of it, impossible.

The approach here is **one spec, two runtimes**:

```
                    spec.js  ─ the domain specification ─
                   (grading bands, ID format, roles,
                    module switches, fee heads, subjects)
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
        database/schema.sql          docs/ — the browser twin
        SQL Server DDL,              the same rules in JS,
        EF6-compatible               running client-side
        → production                 → the live demo
```

Both sides implement the same rules from the same source of truth. The GPA engine, the `YYMMSSSS` identifier allocator, the attendance modes, the module switches and the fee ledger behave identically in the browser twin and in the SQL schema — so the demo is not a mock-up of the system, it *is* the system, minus the server.

---

## Three ideas that make it work

### 1. Derived data, not stored data

§1 sets the scale at 3,000+ students. A year of attendance and three exam terms for that many students is roughly **900,000 rows** — tens of megabytes to ship, and a slow first paint.

So none of it is stored. Every student, every attendance mark, every exam score is a **pure function of a seed**:

```js
attendanceFor(student, date) → hash(`${student.id}|${date}`) → deterministic status
```

The same student gets the same result in any browser, on any day, forever. The full roster of **3,158 students generates in ~40 ms and occupies zero bytes of storage.** A bell curve rather than flat randomness keeps it plausible: the institution reports a 97.8% pass rate, 243 GPA-5 holders (7.7%) and 70 failures — figures a real SSC/HSC institution would recognise.

### 2. Writes overlay reads

Everything you change — a corrected attendance mark, an entered exam score, a logged payment, a new admission — is stored as a **delta on top of the generated baseline**, and reads consult the overlay first.

The result: your edits persist across reloads, the whole demo stays a few kilobytes of `localStorage`, and *Reset demo data* is a single key deletion. In production this layer is simply Entity Framework against SQL Server; the read-through is the only thing unique to the twin.

### 3. The Time Machine

Every screen reads "now" from one function instead of calling `new Date()`. So the entire system can stand on any day of the academic year — results-publish day, a fee deadline, the Test Examination — without waiting for it. In production that function is `DateTime.Now`; the seam is one line wide.

---

## What's built

Every module in §16 ships, and every one has an on/off switch (§4):

| Module | Default | What it does |
|---|---|---|
| Admissions | **on** | Enrolment, with live `YYMMSSSS` identifier preview |
| Student Profiles | **on** | 3,158 records, filtered and paginated in-browser |
| Attendance | **on** | Daily for KG–10, period-wise for 11–12 (§6) |
| Exams & Results | **on** | Mark entry, tabulation, GPA, Bangla report cards |
| Class Routine | **on** | Timetable by class and by teacher |
| Fees & Accounts | **on** | Ledgers, collection, receipts, dues register |
| Notice Board | **on** | Publishing, plus the email/SMS queue |
| Parent Portal | **on** | One guardian account, many children (§10) |
| Library | off | Catalogue, circulation, overdue fines |
| Transport | off | Routes, vehicles, seat allocation, waiting list |
| HR & Payroll | off | Staff directory, pay grades, payslips |
| Hostel | off | Blocks, rooms, bed allocation |

Switching one on or off in **Settings → Modules** rewrites the navigation immediately, and fee heads belonging to a switched-off module stop being billed.

### The rules that were worth getting exactly right

- **§7 — one F fails everything.** A grade below 33% in any compulsory subject fails the whole result and publishes GPA 0.00, however strong the other subjects. Enter a failing mark in *Exams → Mark Entry* and watch the GPA collapse as you type.
- **§7 — the optional 4th subject.** Excluded from the divisor; grade points above 2.00 added as a bonus; a fail in it is harmless.
- **§7 — GPA is truncated, not rounded.** 4.999 publishes as 4.99, as the boards do it.
- **§8 — identifiers are never reused.** The serial counter only ever increases, so withdrawing or graduating a student does not free their number. In the SQL schema the identifier *is* the primary key, so the database itself enforces that.
- **§6 — two attendance modes.** The school section records once a day; the college section records per period, because that is what HSC board eligibility is assessed on. The 70% threshold is a hard flag, not a statistic.
- **§13 — Bangla where it matters.** Admin screens are English; report cards, admit cards and receipts carry Bangla names, Bangla numerals and Bangla dates.

---

## Things the demo tells you that a mock-up wouldn't

**Settings → Notifications** computes what SMS would actually cost: ৳0.30 a message with no free tier, ~2,500 guardians, two sends a month — **around ৳18,000 a year**, an order of magnitude more than the hosting. That is why §12 ships the queue, the audience calculation and the admin toggle, but no paid gateway. The decision to buy one belongs to the institution, and this screen gives them the number to decide with.

**Settings → System Health** projects the 1 GB database ceiling from measured row widths, and shows how many years of records fit while the §14 "no binaries in the database" rule holds. It also keeps the §17 risk list on screen rather than in a document nobody rereads.

---

## Repository layout

```
docs/                        the browser twin — GitHub Pages serves this
  index.html
  sw.js                      offline support (§17: no uptime guarantee)
  assets/js/core/
    spec.js                  the domain specification — single source of truth
    domain.js                pure business rules (GPA, IDs, fees, dates)
    data.js                  deterministic roster, attendance, marks
    facilities.js            library, transport, hostel
    analytics.js             cached institution-wide aggregates
    store.js                 the write overlay
    auth.js                  roles and module switches
    clock.js                 the Time Machine
    ui.js                    escaped templating, components, charts
    router.js                hash routing
  assets/js/modules/         one file per screen
database/
  schema.sql                 SQL Server DDL for the production system
ARCHITECTURE.md              how the two runtimes stay in step
school_college_erp_requirements.md
```

---

## Running it locally

No build step, no dependencies — ES modules served over HTTP:

```bash
cd docs && python3 -m http.server 8000
# open http://localhost:8000
```

It must be served over HTTP rather than opened as a `file://` URL, because ES modules are subject to CORS.

---

## Verification

The domain layer is tested headlessly — 91 assertions covering the grading engine (every band boundary, the fail rule, the 4th-subject rule, GPA truncation, 200-mark normalisation), identifier allocation, attendance modes and eligibility, fee-ledger balance, Bangla rendering, and the facility constraints (no room mixes genders, no route exceeds its seats).

A second pass renders every screen for every role, every tab, and every printable document — 168 checks — asserting no screen emits `undefined`, `NaN`, or an unrendered object.

Both suites pass. Notable bugs they caught during the build:

- **Timezone-dependent dates.** `new Date('2026-08-12')` parses as UTC, so comparing it against a locally-built date marked library books overdue a day early — and `toISOString()` on a local Date backdated every admission by one day in UTC+6. Both are now funnelled through `parseDate` / `toIsoDate`.
- **A capacity-blind transport allocator** that assigned riders at random and put 129 students on a 32-seat bus. Seats are now allocated with fall-through and a waiting list.
- **KG students admitted into the future**, from a lateral-entry branch that could assign an entry level above the student's own grade.

---

## The production side

`database/schema.sql` is the SQL Server schema §18 called for as the next step: 30 tables, EF6-compatible, `NVARCHAR` throughout for Bangla (§13), `DECIMAL` for money, no binary columns anywhere (§14), and indexes chosen for the queries the screens actually issue.

Two things are procedures rather than constraints, because a constraint cannot express them:

- `usp_AllocateStudentId` — takes `UPDLOCK, HOLDLOCK` on the month's counter row so two clerks admitting simultaneously cannot be handed the same identifier.
- `usp_ComputeTermResult` — the §7 grading rules in T-SQL, including the fail rule, the 4th-subject bonus and GPA truncation.

Results are stored rather than derived on read: on 256 MB of RAM (§3), recomputing 3,000 GPAs per page view is not affordable.

---

## Known limits

- The demo runs entirely client-side, so there is no real authentication — the role switcher exists precisely because there are no credentials to hold. Production uses ASP.NET Identity against the `Users` / `Roles` tables.
- Institution-wide attendance trends sample every fourth student to keep a full-year roll-up inside a frame budget. Everything else — the daily register, eligibility, results, ledgers — is computed exactly.
- The ASP.NET application itself is not in this repository. The specification, the domain rules and the schema are; the controllers and Razor views are the build that follows from them.
