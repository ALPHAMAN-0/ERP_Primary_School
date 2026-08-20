---
tags: [overview]
---

# Repository Layout

```
src/
  SchoolErp.Domain/          the rules, as netstandard2.0 — builds anywhere
  SchoolErp.Domain.Tests/    99 xUnit tests over those rules
  SchoolErp.Web/             ASP.NET MVC 5 on .NET Framework 4.8
    App_Start/                bootstrapping (routes, filters, bundles)
    Content/                  static CSS/theme assets
    Controllers/               11 MVC controllers
    Data/                      EF6 DbContext + entity classes
    Filters/                   RequireModuleAttribute (the §4 switch gate)
    Properties/                assembly info
    Scripts/                   client-side JS for the production views
    Services/                  8 application services
    ViewModels/                Razor view-model classes
    Views/                     Razor views, one folder per controller area
docs/                         the browser twin — GitHub Pages serves this
  index.html
  sw.js                       offline support (§17: no uptime guarantee)
  assets/js/core/              12 files — the shared engine (spec, domain rules, storage, auth, UI)
  assets/js/modules/           14 files — one per screen
database/
  schema.sql                  SQL Server DDL for the production system — 44 tables, 3 views, 2 procs
ARCHITECTURE.md               how the two runtimes stay in step
school_college_erp_requirements.md   the source specification, §1–§18
README.md                     project summary and build/run instructions
```

## Related
- [[Domain Library]]
- [[Production App]]
- [[Browser Twin]]
- [[SQL Schema]]
- [[Controllers]]
- [[Services]]
- [[Core Browser Modules]]
- [[Screen Modules]]
- [[Database Tables]]
