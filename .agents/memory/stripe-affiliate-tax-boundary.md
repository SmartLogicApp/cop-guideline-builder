---
name: Stripe affiliate tax boundary
description: Owner-approved boundary for affiliate tax data and test-mode completion
---

Affiliate tax identifiers must stay in Stripe-hosted Connect onboarding. The app must not collect, display, log, or store raw SSN/EIN/TIN values or offer manual W-9 uploads/review/entry. In the Test-only affiliate flow, completion relies on the Stripe account's business-type-specific "ID provided" flag and the absence of outstanding tax-related requirements; this signal is distinct from onboarding completion and does not prove a signed W-9 exists.

**Why:** The owner explicitly rejected app-side handling and human review of tax identifiers while choosing automated Stripe status as the checklist evidence.

**How to apply:** When touching affiliate onboarding, admin controls, audit records, or payout eligibility, keep raw tax data within Stripe, avoid claiming to possess a signed W-9, and preserve independent agreement, onboarding, tax status, admin approval, and minimum-payout gates.