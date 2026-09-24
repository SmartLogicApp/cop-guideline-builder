---
name: Test affiliate identity handoff
description: Safety boundary for handing a synthetic Stripe Connect test affiliate to a real account holder.
---

When handing an existing synthetic test affiliate to an owner-controlled identity, treat the old browser session and its consents as non-transferable. Revoke prior payment authorization and document acknowledgements, advance any identity-scoped acceptance boundary, and require the new owner to verify their own login, region, and legal-name authorization. Keep the existing Test connected account only after confirming that it belongs to the same affiliate and updating its contact email.

**Why:** A programmatic test session cannot be handed over as a usable login. Payment authorization and document acknowledgements are acts of the signer, not reusable setup fixtures; leaving them current would allow the next person to start onboarding under someone else's consent.

**How to apply:** For owner-controlled manual Connect onboarding after an automated smoke test, preserve the test account association while resetting signer-specific compliance state. Never convert a synthetic test session into shared credentials or a magic link.