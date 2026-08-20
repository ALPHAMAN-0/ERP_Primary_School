---
tags: [module]
---

# Fees & Accounts Module

On by default at launch (§4, §16). Covers ledgers, fee collection, receipts, and a dues register.

Production side: `FeesController`, backed by `FeeService`. Browser-twin side: `fees.js`. V1 fee collection is manual/cash — parents pay at the office and the Accountant role logs the payment — but the architecture is built to support an online gateway (bKash/Nagad/cards) later without a rewrite.

Touches the `FeeHeads`, `FeeStructures`, `Invoices`, `InvoiceLines`, `Payments`, and `Waivers` tables.

## Related
- [[Fee Ledger]]
- [[§11 Fees]]
- [[§16 Modules Included]]
- [[Controllers]]
- [[Services]]
