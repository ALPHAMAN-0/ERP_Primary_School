---
tags: [requirement]
---

# §17 Known Risks

These were consciously accepted trade-offs, not oversights — flagged here so they stay visible:

- **RAM headroom** — 256MB dedicated RAM is thin for 3,000+ students hitting the system concurrently (e.g. results day). Realistic risk of slow pages or app-pool recycling under peak load.
- **Database ceiling** — 1GB should last a while if the "no binary files in the DB" rule holds, but will need monitoring and an archiving plan as years of records accumulate.
- **No custom domain** on the free hosting tier.
- **No uptime guarantee** on the free hosting tier.
- **Student rollout pacing** — not explicitly confirmed (see [[§8 Student Identity & Admissions]]).
- **Nursery/Play grade levels** — not explicitly confirmed as in or out of scope (see [[§5 Academic Structure]]).

## Related
- [[§3 Hosting Constraints]]
- [[Known Limits]]
- [[Database Tables]]
- [[Settings & System Health]]
