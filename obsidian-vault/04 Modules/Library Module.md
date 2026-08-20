---
tags: [module]
---

# Library Module

Off by default (§4, §16) — toggle-able by admin. Covers the catalogue, circulation, and overdue fines.

**No production ASP.NET controller exists for this module.** It is implemented only in the browser twin, via `library.js`. Touches the `Books`, `BookCopies`, and `BookLoans` tables.

This screen is where the build's timezone bug was caught: `new Date('2026-08-12')` parses as UTC, so comparing it against a locally-built date marked library books overdue a day early. It's now funnelled through `parseDate`/`toIsoDate` instead of raw `Date` parsing.

## Related
- [[Verification & Testing]]
- [[Known Limits]]
- [[§16 Modules Included]]
