---
tags: [module]
---

# Exams & Results Module

On by default at launch (§4, §16). Covers mark entry, tabulation, GPA computation, and Bangla report cards. The mark-entry screen recomputes the §7 fail rule on every keystroke, so the consequence of a mark is visible while it's being typed, not discovered later at tabulation.

Production side: `ExamsController`, backed by `ExamService` — which fetches marks, hands them to the shared `ResultCalculator`, and stores the result, containing no grading logic of its own. Browser-twin side: `exams.js`.

Touches the `Marks`, `TermResults`, `ExamTerms`, and `GradeScale` tables.

## Related
- [[Grading Engine]]
- [[Bangla Language Support]]
- [[§7 Grading & Results]]
- [[§16 Modules Included]]
- [[Controllers]]
- [[Services]]
