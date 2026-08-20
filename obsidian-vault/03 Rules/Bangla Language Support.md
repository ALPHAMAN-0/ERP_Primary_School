---
tags: [rule]
---

# Bangla Language Support

Admin- and teacher-facing UI is English; student-facing official documents — report cards, certificates, admit cards — are Bangla-capable (§13). The database uses `NVARCHAR` throughout to support Bangla text.

`BanglaFormatter.cs` (`Domain/Common`) renders Bangla names, numerals, and dates. Report cards, admit cards, and receipts carry Bangla names, Bangla numerals, and Bangla dates; admin screens stay English throughout.

## Related
- [[§13 Language]]
- [[Domain Library]]
- [[SQL Schema]]
- [[Exams & Results Module]]
- [[Student Profiles Module]]
