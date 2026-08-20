---
tags: [inventory]
---

# Core Browser Modules

The 12 files in `docs/assets/js/core/` — the shared engine that every screen module is built on.

| File | Role | Implements |
|---|---|---|
| `spec.js` | The domain specification, single source of truth | [[Domain Specification]] |
| `domain.js` | Pure business rules: GPA, IDs, fees, dates | [[Grading Engine]] |
| `data.js` | Deterministic roster, attendance, marks | [[Browser Twin]] |
| `facilities.js` | Library, transport, hostel | [[Library Module]] |
| `analytics.js` | Cached institution-wide aggregates | [[Browser Twin]] |
| `store.js` | The write overlay | [[Write Overlay]] |
| `auth.js` | Roles and module switches | [[Roles & Permissions]] |
| `clock.js` | The Time Machine | [[Time Machine]] |
| `ui.js` | Escaped templating, components, charts | [[Browser Twin]] |
| `router.js` | Hash routing | [[Browser Twin]] |
| `rng.js` | FNV-1a hash + Mulberry32 seeded RNG powering derived data | [[Browser Twin]] |
| `names.js` | Bangla name generation | [[Bangla Language Support]] |

## Related
- [[Browser Twin]]
- [[Screen Modules]]
