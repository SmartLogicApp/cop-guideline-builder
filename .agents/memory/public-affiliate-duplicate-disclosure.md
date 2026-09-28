---
name: Public affiliate duplicate disclosure
description: Why the public affiliate form reveals duplicate-email conflicts instead of returning a success-shaped response.
---

**Rule:** Keep one affiliate application per email, including when an older record was rejected. Return an explicit duplicate conflict to the applicant, and distinguish it from the changed-agreement conflict in the form.

**Why:** The owner chose accurate applicant feedback after a rejected-email resubmission appeared successful but created nothing. This knowingly gives up the earlier protection against probing whether an email already belongs to an affiliate record; do not silently restore success-shaped duplicates as a privacy fix.

**How to apply:** Handle both the initial existing-email check and the concurrent unique-constraint race identically. If a future privacy requirement conflicts with disclosure, discuss the tradeoff rather than reinstating a misleading success message.