---
tags: [rule]
---

# Time Machine

Every screen reads "now" from one function — `clock.js` — instead of calling `new Date()`, so the entire system can stand on any day of the academic year — results-publish day, a fee deadline, the Test Examination — without waiting for it. In production, that function is `DateTime.Now`; the seam is one line wide.

This is directly tied to a bug the test suites caught: `new Date('2026-08-12')` parses as UTC, so comparing it against a locally-built date marked library books overdue a day early, and backdated admissions by a day in UTC+6. Both are now funnelled through `parseDate` / `toIsoDate`.

## Related
- [[Browser Twin]]
- [[Verification & Testing]]
- [[Write Overlay]]
