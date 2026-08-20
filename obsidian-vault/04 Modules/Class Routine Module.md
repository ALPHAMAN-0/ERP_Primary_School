---
tags: [module]
---

# Class Routine Module

On by default at launch (§4, §16). Presents the timetable by class and by teacher.

Notably, **no production ASP.NET controller for this module exists** anywhere in `src/SchoolErp.Web/Controllers` — unlike every other on-by-default module, Class Routine is currently implemented only in the browser twin, via `routine.js`. This is a real gap in the production side rather than a documentation oversight.

Touches the `RoutineSlots` table.

## Related
- [[Known Limits]]
- [[§16 Modules Included]]
- [[Controllers]]
