---
name: Trial audience boundary
description: Distinct payment-method timing for direct customers and consultant affiliates
---

Do not apply the direct-customer payment-method disclosure or checkout behavior to the Affiliate Sign Up / consultant trial. Direct customers must provide a valid payment method when starting their 30-day trial and are charged on day 31 if they do not cancel. Consultants genuinely receive a no-card 30-day trial; the card requirement applies only when that period ends.

**Why:** The owner explicitly distinguished these offers while correcting inaccurate direct-customer advertising copy. A blanket replacement of no-card wording would make consultant copy inaccurate and could change the wrong signup flow.

**How to apply:** Scope trial-copy searches and changes by audience. Keep affiliate/consultant copy and trial behavior unchanged unless the owner separately requests changes for that audience.

New direct registrations must not receive workspace access before Stripe collects a card. Preserve already-started local trials instead of revoking existing customers' access. A self-selected consultant label or referral code is not proof of affiliate eligibility; new no-card consultant trials require a verified, active affiliate identity.

**Why:** The old shared local trial granted direct customers cardless access, but removing all local trials would also break the consultant offer and cut off existing customers. Self-declared consultant status would let direct customers bypass the corrected requirement.

**How to apply:** Keep registration entitlement checks on the server, grandfather existing trial rows, and distinguish approved consultant affiliates from direct customers before granting a new local trial.

An existing direct-client contact who independently qualifies as an affiliate is a narrow exception to the card-first rule: keep the client's account and Stripe state intact, and give that person a time-limited affiliate workspace grant. Do not issue a second direct-customer trial when the affiliate later adds a card.

**Why:** One person can legitimately have both roles. Replacing their client subscription would lose billing identity, while stacking the two trials would silently extend the advertised card-free period.

**How to apply:** Treat affiliate membership and workspace entitlement separately from client subscription ownership. Anchor any subsequent checkout trial to the original affiliate grant expiry; do not silently charge during the last short window before that expiry.