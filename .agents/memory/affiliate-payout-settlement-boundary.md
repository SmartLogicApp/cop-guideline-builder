---
name: Affiliate payout settlement boundary
description: Conditions for safely coordinating historical commissions with reviewed Connect payouts
---

Never re-enable the historical affiliate payout settlement action merely because an affiliate passes the current compliance checklist. A settlement must reserve the exact commission rows under a transactional affiliate lock, be uniquely associated with one payout, and verify the resulting Stripe transfer identity, destination, amount, and currency before those commissions are marked paid. A partial transfer reversal is a manual reconciliation case, not permission to release every claim automatically.

Any external transfer attempt must first persist a non-voidable processing state outside the Stripe-call transaction. If the response or subsequent database commit is uncertain, keep claims reserved and block both void and retry until the transfer is reconciled; idempotency keys alone are not a permanent guarantee against a later duplicate transfer.

**Why:** The original manual path marked the legacy commission ledger paid before payment was actually sent. A second payout workflow and asynchronous Connect webhooks make duplicate or unrelated settlement possible unless both ledgers agree on exact claims and transfer evidence. Stripe can accept a transfer even if the database transaction rolls back or the network response is lost.

**How to apply:** Any new payout route, batch, retry, webhook, or reactivation of a historical endpoint must use the shared eligibility gate, exact claim ownership, durable attempt state, and verified transfer evidence. Keep the old settlement path blocked until it is unified with those controls; preserve old payout history.