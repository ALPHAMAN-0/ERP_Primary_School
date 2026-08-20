---
tags: [module]
---

# Transport Module

Off by default (§4, §16) — toggle-able by admin. Covers routes, vehicles, seat allocation, and a waiting list.

**No production ASP.NET controller exists for this module.** It is implemented only in the browser twin, via `transport.js`. Touches the `Routes`, `RouteStops`, `Vehicles`, and `TransportAssignments` tables.

This screen is where the build's capacity-blind allocator bug was caught: an earlier version assigned riders at random and put 129 students on a 32-seat bus. Seats are now allocated with fall-through logic plus an explicit waiting list.

## Related
- [[Verification & Testing]]
- [[Known Limits]]
- [[§16 Modules Included]]
