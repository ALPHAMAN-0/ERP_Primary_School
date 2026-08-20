---
tags: [rule]
---

# Roles & Permissions

A fixed-roles model, not a flexible permission matrix (§9): Admin, Teacher, Accountant, Librarian, Transport Manager, HR Manager, Student, Parent. A staff member wearing multiple hats gets assigned multiple roles rather than a custom permission set.

In the browser twin: a route allow-list in `auth.js`, paired with a role switcher instead of real login — there is nothing to hold client-side. In production: `dbo.Roles`/`dbo.UserRoles`, `[Authorize(Roles=…)]` on controller actions, and ASP.NET Identity for real authentication.

## Related
- [[§9 Roles & Permissions]]
- [[Domain Specification]]
- [[Authentication & Security]]
- [[Parent Portal Module]]
- [[Production App]]
