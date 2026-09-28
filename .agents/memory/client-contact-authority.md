---
name: Client contact authority
description: Why client reports and lifecycle reminders cannot rely only on stored account-user email
---

Use the verified primary contact from Clerk for a linked account user before relying on the stored account-user email; keep stored email as a fallback for an unavailable Clerk lookup. A failed lookup with no stored address is an operational failure, not evidence that the customer has no email.

**Why:** Session email claims do not reliably populate the stored account-user email at registration. Accounts created through Clerk can therefore appear to have no email in admin reports and be skipped by lifecycle reminders even when their Clerk identity has a verified address.

**How to apply:** Keep the Admin Clients report/export and every trial reminder path on the same account-bound contact resolver. Prefer the account admin's linked Clerk ID; do not infer identity from a facility name or search Clerk by an unverified address.