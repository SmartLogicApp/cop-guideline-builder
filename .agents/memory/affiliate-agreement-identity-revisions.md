---
name: Affiliate agreement identity revisions
description: Why agreement acceptance must track changes to the applicant contact independently of document version
---

Acceptance for an affiliate agreement must apply to the applicant identity revision that received and accepted it, not just to the current email string or the agreement version. Keep earlier acceptance records for audit, but require a new invitation and acceptance after a contact-email change—even if that email is later changed back. Permit a new acceptance of the same document version for each identity revision.

**Why:** Email-only matching can revive stale acceptance when a contact address is changed away and back. Conversely, uniqueness by applicant and document version alone blocks a replacement contact from accepting the same still-current agreement. Activation must also compare the identity revision atomically with the status update so concurrent changes cannot bypass the check.

**How to apply:** Use this rule whenever changing invitations, acceptance evidence, contact-email editing, or a pending/non-active-to-active transition. Existing active partners' earned commissions and payouts remain independent of this new-activation gate.