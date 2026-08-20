---
tags: [rule]
---

# Fee Ledger

V1 is manual/cash payments: parents pay at the office, and the Accountant role logs the payment in the system (§11). The architecture supports an online gateway (bKash/Nagad/cards) later, but it isn't wired to a real provider yet.

The chain from spec to storage: spec `FEE_HEADS`/`TUITION_BY_LEVEL` → `studentLedger()` in the browser twin → `FeeCalculator.cs` in the Domain library → the `FeeHeads`/`FeeStructures`/`Invoices`/`InvoiceLines`/`Payments`/`Waivers` tables in SQL → `FeeService.cs` in production.

A fee head belonging to a switched-off module stops being billed — the fee ledger is one of the three things a module switch touches.

## Related
- [[§11 Fees]]
- [[Domain Specification]]
- [[Domain Library]]
- [[SQL Schema]]
- [[Fees & Accounts Module]]
- [[Module Switches]]
- [[Services]]
