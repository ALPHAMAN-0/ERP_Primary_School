---
tags: [runtime]
---

# Browser Twin

`docs/` is the static GitHub Pages twin: `index.html`, `sw.js` (offline support — there is no uptime guarantee on the free hosting tier), `assets/js/core/` (12 shared engine files), and `assets/js/modules/` (14 screen files).

**No build step.** ES modules are served directly over HTTP: `cd docs && python3 -m http.server 8000`. It must be served, not opened as a `file://` URL, because ES modules are subject to CORS.

**Derived, not stored.** Every student, attendance mark, and exam score is a pure function of a seed, via a 32-bit FNV-1a hash feeding a Mulberry32 generator. The same student gets the same result in any browser, forever — 3,158 students generate in roughly 36–40ms and occupy zero bytes of storage. A bell curve (one latent ability per student, a 14% high-achiever cohort, tight per-subject variance) keeps results plausible rather than flatly random: a 97.8% pass rate, 7.7% GPA-5 holders, and 70 failures.

## Related
- [[Domain Specification]]
- [[Core Browser Modules]]
- [[Screen Modules]]
- [[Write Overlay]]
- [[Time Machine]]
