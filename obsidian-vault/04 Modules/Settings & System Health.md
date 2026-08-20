---
tags: [module]
---

# Settings & System Health

An admin utility screen — not one of the 12 catalogued ERP modules in §16, but load-bearing for the whole system. Production side: `SettingsController`. Browser-twin side: `settings.js`.

Three sub-screens:

- **Settings → Modules** — toggles the §4 module switches. Flipping one rewrites navigation immediately and stops billing any fee head belonging to a switched-off module.
- **Settings → Notifications** — computes the real cost of turning on SMS: ~৳0.30/message, no free tier, ~2,500 guardians, two sends a month, roughly ৳18,000/year. See [[Notice Board Module]].
- **Settings → System Health** — projects the 1GB database ceiling (§14, §17) from measured row widths, shows how many years of records fit while the "no binaries in the database" rule holds, and keeps the §17 risk list visible on screen rather than buried in a document nobody rereads.

Touches the `ModuleSettings` and `AppSettings` tables.

## Related
- [[Module Switches]]
- [[§17 Known Risks]]
- [[Notice Board Module]]
- [[Controllers]]
