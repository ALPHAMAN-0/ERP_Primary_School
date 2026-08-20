---
tags: [module]
---

# Hostel Module

Off by default (§4, §16) — toggle-able by admin. Covers hostel blocks, rooms, and bed allocation.

**No production ASP.NET controller exists for this module.** It is implemented only in the browser twin, via `hostel.js`. Touches the `HostelBlocks`, `HostelRooms`, and `HostelAllocations` tables.

One of the tested facility constraints lives here: no room mixes genders — verified by the same headless test pass that checks no transport route exceeds its seats.

## Related
- [[Verification & Testing]]
- [[Known Limits]]
- [[§16 Modules Included]]
