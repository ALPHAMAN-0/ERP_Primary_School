---
tags: [requirement]
---

# §12 Notices & Communication

SMS: scaffolded — a queue and an admin toggle showing "Gateway: Not Configured" — but not wired to a real paid SMS provider. Bangladesh bulk SMS runs ~0.30 BDT/message; at 3,000+ students that's a real recurring cost with no free option, so it's deferred rather than built now.

Email: sent through an abstracted `INotificationService` so the underlying provider is a config change, not a rewrite. Demo/dev uses personal Gmail SMTP (fine at test scale). Production, once real students are onboarded, switches to Brevo's free tier (300 emails/day, built for automated transactional sending, no credit card) — Gmail isn't suitable at production scale, since its ~500/day cap and spam-detection systems aren't designed for scripted bulk sending.

## Related
- [[Notice Board Module]]
