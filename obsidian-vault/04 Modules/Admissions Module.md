---
tags: [module]
---

# Admissions Module

On by default at launch (§4, §16). Handles enrolment, with a live `YYMMSSSS` identifier preview that updates as the admissions clerk fills the form — so the ID a student will be assigned is visible before the record is even saved.

Production side: `AdmissionsController` drives the screen, backed by `AdmissionService`, which allocates identifiers through `usp_AllocateStudentId` inside a serializable transaction — a failed insert rolls the serial back with it rather than burning a number. Browser-twin side: `admissions.js` reproduces the same identifier-preview behaviour client-side.

Touches the `Students`, `Enrolments`, and `StudentIdSequence` tables.

## Related
- [[Student Identifiers]]
- [[§8 Student Identity & Admissions]]
- [[§16 Modules Included]]
- [[Controllers]]
- [[Services]]
