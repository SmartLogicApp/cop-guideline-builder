---
name: Affiliate agreement transition
description: Legal and financial boundary when a new affiliate agreement becomes effective.
---

Treat a new affiliate agreement as a per-partner transition, not a global permission to rewrite existing financial rights. Automated rate reductions and new commission accrual under the reviewed terms require that partner's current acceptance; publication and configuration alone are insufficient. For accrual, acceptance must already exist when the customer payment occurred, not merely by the time a delayed or retried webhook is processed.

**Why:** Applying a new rate schedule to partners who have not accepted it would change their terms unilaterally. Crediting an earlier payment after a later acceptance would defeat the explicit pause on new accrual pending acceptance.

**How to apply:** Gate scheduled and manual financial paths consistently on the current published agreement and matching partner identity, version, and content hash. Compare acceptance time to payment time for webhook accrual, and preserve prior ledger entries rather than recalculating them.