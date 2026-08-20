---
tags: [requirement]
---

# §15 Backups & Disaster Recovery

A nightly background job (Hangfire) exports the database to a compressed file, and uploads it to Google Drive via its free API (15GB free storage) — kept separate from the hosting provider so an outage on one doesn't take out the other. Retains the last 30 days; older backups auto-delete.

## Related
- [[Backups & Disaster Recovery]]
