# CLAUDE.md

## Build / test
```bash
dotnet build src/SchoolErp.Domain
dotnet test  src/SchoolErp.Domain.Tests      # 99 passing
nuget restore src/SchoolErp.sln
msbuild src/SchoolErp.Web/SchoolErp.Web.csproj /p:Configuration=Release
```

## Run the browser twin locally
```bash
cd docs && python3 -m http.server 8000
# open http://localhost:8000
```
Must be served over HTTP, not opened as `file://` — ES modules are subject to CORS (README).

## Rules
- `src/SchoolErp.Web` has never been compiled on this machine (no Windows/System.Web on macOS) — expect first-build compile errors, most likely in Razor views (README "Known limits").
- `database/schema.sql` has never been executed against a real SQL Server.
- `src/SchoolErp.Domain` must stay dependency-free of `System.Web`/EF/storage — it's what lets the rules build and test on any platform (README).

## Files worth reading first
- README.md — the two-runtime architecture, module list, and known limits
- src/SchoolErp.Domain/ — the C# rules (Attendance, Common, Fees, Grading, Identity)
- docs/assets/js/core/ — the JS mirror of the same rules (spec.js, domain.js, store.js, auth.js, clock.js)

Architecture: see ARCHITECTURE.md — read before structural changes
