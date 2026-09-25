---
name: Stripe affiliate tax boundary
description: Owner-approved boundary for affiliate tax data and test-mode completion
---

Affiliate tax identifiers must stay in Stripe-hosted Connect onboarding. The app must not collect, display, log, or store raw SSN/EIN/TIN values or offer manual W-9 uploads/review/entry. In the Test-only affiliate flow, completion relies on the Stripe account's business-type-specific "ID provided" flag and the absence of outstanding tax-related requirements; this signal is distinct from onboarding completion and does not prove a signed W-9 exists.

**Why:** The owner explicitly rejected app-side handling and human review of tax identifiers while choosing automated Stripe status as the checklist evidence.

**How to apply:** When touching affiliate onboarding, admin controls, audit records, or payout eligibility, keep raw tax data within Stripe, avoid claiming to possess a signed W-9, and preserve independent agreement, onboarding, tax status, admin approval, and minimum-payout gates.

Free-text defenses must include grouped payment-account formats as well as nine-digit tax IDs, while leaving ordinary dates and UUID/Stripe event IDs readable. Redact legacy records at every output surface, including aggregate payout previews, not just individual detail pages.

**Why:** A narrower tax-only detector left grouped account numbers writable and visible through payout summaries.

**How to apply:** When extending affiliate free-text fields or returning old records, test grouped numeric inputs (including eight-digit account numbers), nested JSON, dates, UUIDs, and list/detail/export responses together.