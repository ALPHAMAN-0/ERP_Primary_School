---
tags: [requirement]
---

# §14 File & Document Storage

All uploaded files — student photos, scanned admission documents, ID scans — are stored on the filesystem (the separate 5GB website storage), never as binary data inside the SQL Server database. Only the file path is stored in the DB.

## Related
- [[SQL Schema]]
- [[Known Limits]]
