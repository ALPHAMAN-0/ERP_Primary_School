---
tags: [overview]
---

# Verification & Testing

**Domain layer — 99 xUnit tests.** `GradingTests.cs` and `IdentityAndFeeTests.cs` carry 91 assertions covering every grade-band boundary, the fail rule, the 4th-subject rule, GPA truncation, 200-mark normalization, identifier allocation, attendance modes and eligibility, fee-ledger balance, Bangla rendering, and facility constraints (no room mixes genders, no route exceeds its seats). All 99 pass.

**Browser twin — 168 render checks.** A second pass renders every screen for every role, every tab, and every printable document, asserting that no screen emits `undefined`, `NaN`, or an unrendered object.

**Notable bugs the suites caught during the build:**
- **Timezone-dependent dates.** `new Date('2026-08-12')` parses as UTC, so comparing it against a locally-built date marked library books overdue a day early, and `toISOString()` on a local `Date` backdated every admission by one day in UTC+6. Both are now funnelled through `parseDate` / `toIsoDate`.
- **A capacity-blind transport allocator** that assigned riders at random and put 129 students on a 32-seat bus. Seats are now allocated with fall-through and a waiting list.
- **KG students admitted into the future**, from a lateral-entry branch that could assign an entry level above the student's own grade.

## Related
- [[Domain Library]]
- [[Domain Specification]]
- [[Time Machine]]
- [[Transport Module]]
- [[Admissions Module]]
- [[Known Limits]]
