---
tags: [rule]
---

# Authentication & Security

The browser twin has no real authentication — the role switcher exists precisely because there are no credentials to hold client-side.

Production's `AccountController` uses PBKDF2 with the iteration count stored alongside the hash, constant-time comparison, and one identical failure message for every rejection so guardian phone numbers can't be enumerated — backed by ASP.NET Identity against `dbo.Users`/`dbo.UserRoles`.

## Related
- [[Roles & Permissions]]
- [[Production App]]
- [[Database Tables]]
- [[Known Limits]]
