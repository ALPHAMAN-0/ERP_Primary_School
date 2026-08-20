---
tags: [module]
---

# Student Profiles Module

On by default at launch (§4, §16). Presents the full roster — 3,158 student records in the browser twin — filtered and paginated entirely client-side, with no server round-trip per page.

Production side: `StudentsController`. Browser-twin side: `students.js`. Because student-facing official documents must be Bangla-capable, this screen is one of the main consumers of the project's Bangla rendering path.

Touches the `Students`, `Guardians`, and `Enrolments` tables.

## Related
- [[Bangla Language Support]]
- [[§16 Modules Included]]
- [[Controllers]]
