# School & College ERP — Requirements Specification

**Status:** Draft, pending your review
**Prepared:** August 2026

---

## 1. Project Overview

- **Institution type:** One composite institution — a school section and a college section under a single administration (the standard "School and College" model).
- **Purpose:** Real, production system for actual day-to-day use — not a demo or academic exercise.
- **Scale:** 3,000+ students across both sections.
- **Launch approach:** Full suite is built together; every module ships in v1 rather than in phases.

---

## 2. Technology Stack

| Layer | Choice |
|---|---|
| Framework | ASP.NET MVC 5 (.NET Framework 4.8) |
| View engine | Razor |
| Frontend | Bootstrap (responsive — most parents/teachers will use phones) |
| Database | SQL Server |
| ORM | Entity Framework 6 |
| Background jobs | Hangfire (backups, notification queue) |
| Hosting | MonsterASP.NET — Free tier |

---

## 3. Hosting — Current Constraints (Free Tier)

| Resource | Free tier limit |
|---|---|
| Website storage | 5 GB |
| RAM | 256 MB dedicated |
| Databases | 1 |
| Database storage | 1 GB |
| Domain | Subdomain only (no custom domain) |
| Email accounts | None included |
| Uptime | No guarantees or warranties |
| Backups | Not included — handled in-app (see §12) |

**Documented upgrade path:** MonsterASP Premium Single, ~$1.95/mo first year ($2.50/mo renewal) — adds a custom domain, 512MB RAM, 2 databases at 2GB each, unlimited traffic, and automatic daily backups. Not selected for now; noted here in case it's revisited.

---

## 4. Feature Toggle System (applies to every module)

Every module — Fees, Library, Transport, HR/Payroll, Hostel, Notices — has an on/off switch in an Admin Settings screen. Everything ships built into the codebase; the institution only sees and uses what's switched on.

- **On by default at launch:** Admissions, Student Profiles, Attendance, Exams/Results, Class Routine, Fees, Notice Board, Parent Portal.
- **Off by default at launch, toggle-able by admin:** Library, Transport, Hostel/Boarding, HR/Payroll.

---

## 5. Academic Structure

- **School section:** KG through Class 10 (leads to SSC). *Open item: confirm if Nursery/Play levels below KG are needed.*
- **College section:** Class 11–12 (HSC).
- **Groups:** Science / Business Studies (Commerce) / Humanities — assigned from Class 9 through Class 12, determines each student's subject list.

---

## 6. Attendance

- **School section (KG–10):** Daily attendance, once per day.
- **College section (11–12):** Period-wise / subject-wise attendance, supporting HSC board exam attendance-eligibility rules.

---

## 7. Grading & Results

- Internal exams use the same GPA system as the SSC/HSC boards:

| Marks | Grade | GPA |
|---|---|---|
| 80–100 | A+ | 5.00 |
| 70–79 | A | 4.00 |
| 60–69 | A- | 3.50 |
| 50–59 | B | 3.00 |
| 40–49 | C | 2.00 |
| 33–39 | D | 1.00 |
| Below 33 | F | 0.00 |

- A failing grade in any single subject fails the overall result, regardless of GPA in other subjects.

---

## 8. Student Identity & Admissions

- Every student gets a **permanent, unique ID at admission, never reused** — even after graduation or withdrawal.
- **Format:** `YYMMSSSS` (8 digits) — 2-digit year + 2-digit month (zero-padded) + 4-digit serial.
  - Example: 5th student admitted in August 2026 → `26080005`
  - Capacity: up to 9,999 admissions per month.
- **Student population rollout:** *Open item — a phased rollout (pilot one grade first) was recommended but not explicitly confirmed; currently the working default unless revisited.*

---

## 9. Roles & Permissions

- **Model:** Fixed roles, not a flexible permission matrix. A staff member wearing multiple hats gets assigned multiple roles.
- **Roles:** Admin, Teacher, Accountant, Librarian, Transport Manager, HR Manager, Student, Parent.

---

## 10. Parent / Guardian Accounts

- Parents get their **own account**, separate from the student login.
- Each parent account **links to one or more children** — built for multi-child families.
- Requires a guardian verification/linking step during registration.

---

## 11. Fees

- **V1:** Manual/cash payments — parents pay at the office, Accountant role logs the payment in the system.
- **Architecture:** Built to support an online gateway (bKash/Nagad/cards) later, but not wired to a real provider yet. Gateway transaction fees will need to be researched when this is activated.

---

## 12. Notices & Communication

- **SMS:** Scaffolded — queue, admin toggle showing "Gateway: Not Configured" — but not wired to a real paid SMS provider. (Bangladesh bulk SMS runs ~0.30 BDT/message; at 3,000+ students this is a real recurring cost with no free option, so it's deferred rather than built now.)
- **Email:** Sent through an abstracted `INotificationService` so the underlying provider is a config change, not a rewrite.
  - **Demo/dev:** personal Gmail SMTP (fine at test scale).
  - **Production, once real students are onboarded:** switch to Brevo's free tier (300 emails/day, built for automated transactional sending, no credit card). Gmail is not suitable at production scale — its ~500/day cap and spam-detection systems aren't designed for scripted bulk sending.

---

## 13. Language

- **Admin/Teacher-facing UI:** English.
- **Student-facing official documents** (report cards, certificates, admit cards): Bangla-capable.
- Database uses Unicode (`nvarchar`) columns throughout to support Bangla text.

---

## 14. File & Document Storage

- All uploaded files (student photos, scanned admission documents, ID scans) are stored on the **filesystem** (the separate 5GB website storage) — **never** as binary data inside the SQL Server database. Only the file path is stored in the DB.

---

## 15. Backups & Disaster Recovery

- Nightly background job (Hangfire) exports the database to a compressed file.
- Uploads to Google Drive via its free API (15GB free storage) — kept separate from the hosting provider so an outage on one doesn't take out the other.
- Retains the last 30 days; older backups auto-delete.

---

## 16. Modules Included (Full Suite)

- **Core:** Admissions, Student Profiles, Attendance, Exams/Results, Class Routine
- **Fees / Accounts**
- **Communication:** Notice board, Email (SMS scaffolded, inactive)
- **Parent Portal**
- **Library** *(off by default)*
- **Transport** *(off by default)*
- **HR / Payroll** *(off by default)*
- **Hostel / Boarding** *(off by default)*

---

## 17. Known Risks & Open Items

These were consciously accepted trade-offs, not oversights — flagged here so they stay visible:

- **RAM headroom:** 256MB dedicated RAM is thin for 3,000+ students hitting the system concurrently (e.g., results day). Realistic risk of slow pages or app-pool recycling under peak load.
- **Database ceiling:** 1GB should last a while if the "no binary files in the DB" rule holds, but will need monitoring and an archiving plan as years of records accumulate.
- **No custom domain** on the free hosting tier — students/parents will see a MonsterASP subdomain unless upgraded to Premium.
- **No uptime guarantee** on the free hosting tier.
- **Student rollout pacing** — not explicitly confirmed (see §8).
- **Nursery/Play grade levels** — not explicitly confirmed as in or out of scope (see §5).

---

## 18. Next Steps

This document reflects everything settled so far. Once you've reviewed it, natural next steps would be database schema design, then a build plan module by module.
