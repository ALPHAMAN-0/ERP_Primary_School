---
tags: [rule]
---

# Grading Engine

Four rules, all implemented in `computeResult()` and mirrored in `usp_ComputeTermResult`:

1. **Normalization first.** Marks normalize against the subject's full mark before the band lookup, so a 200-mark HSC paper grades on the same scale as a 100-mark one.
2. **One F fails everything.** A fail in any compulsory subject fails the whole result — GPA publishes as 0.00, letter F, regardless of the other grades. Enforced additionally by a SQL `CHECK` constraint: `HasFailed = 0 OR Gpa = 0`.
3. **The optional 4th subject** is excluded from the divisor; its grade points above 2.00 are added as a bonus; a fail in it is harmless.
4. **GPA is truncated, not rounded**, then capped at 5.00.

| Marks | Grade | GPA |
|---|---|---|
| 80–100 | A+ | 5.00 |
| 70–79 | A | 4.00 |
| 60–69 | A- | 3.50 |
| 50–59 | B | 3.00 |
| 40–49 | C | 2.00 |
| 33–39 | D | 1.00 |
| Below 33 | F | 0.00 |

The mark-entry screen recomputes rule 2 on every keystroke, so the consequence of a mark is visible while it is being typed.

## Related
- [[§7 Grading & Results]]
- [[Domain Specification]]
- [[Domain Library]]
- [[SQL Schema]]
- [[Stored Procedures]]
- [[Exams & Results Module]]
- [[Verification & Testing]]
