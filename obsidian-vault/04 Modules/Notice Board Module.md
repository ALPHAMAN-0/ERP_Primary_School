---
tags: [module]
---

# Notice Board Module

On by default at launch (§4, §16). Handles publishing, plus an email/SMS notification queue.

Production side: `NoticesController`, backed by `NotificationService`, which delivers email via `SmtpClient` (the provider is a `Web.config` change) and writes SMS to the queue rather than sending it, recording its cost as it goes. Browser-twin side: `notices.js`.

The **Settings → Notifications** screen (see [[Settings & System Health]]) computes what SMS would actually cost: ~৳0.30/message with no free tier, ~2,500 guardians, two sends a month — roughly ৳18,000/year, an order of magnitude more than hosting. That number is why the queue, the audience calculation, and the admin toggle ship, but no paid SMS gateway is wired: the decision to buy one belongs to the institution.

Touches the `Notices` and `NotificationQueue` tables.

## Related
- [[§12 Notices & Communication]]
- [[Settings & System Health]]
- [[§16 Modules Included]]
- [[Controllers]]
- [[Services]]
