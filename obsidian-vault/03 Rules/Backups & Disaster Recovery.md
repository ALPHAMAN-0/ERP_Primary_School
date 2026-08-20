---
tags: [rule]
---

# Backups & Disaster Recovery

A nightly Hangfire background job exports the database to a compressed file and uploads it to Google Drive via its free API (15GB free storage), kept deliberately separate from the hosting provider so an outage on one doesn't take out the other. The last 30 days are retained; older backups auto-delete (§15).

`BackupService.cs` implements this; `dbo.BackupLog` tracks each run. The Google Drive upload itself is a deliberate seam — it needs a service-account credential the institution must create — but the export, compression, logging, and 30-day pruning around it are already written.

## Related
- [[§15 Backups & Disaster Recovery]]
- [[Production App]]
- [[Services]]
- [[Known Limits]]
