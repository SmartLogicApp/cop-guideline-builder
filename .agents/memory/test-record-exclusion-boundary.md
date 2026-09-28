---
name: Test-record exclusion boundary
description: Distinguish operational Test flags from historical financial records and separately live accounts
---

An admin Test flag is a reversible operational exclusion, not a deletion or retroactive rewrite. A flagged client or affiliate must not generate new commissions or pass draft, approval, or final-transfer payout gates, but historical paid claims remain available for explicit review. A live client account owned by a Test affiliate is still a live client: hide the Test affiliate association by default, not the client's account or usage.

**Why:** A merged admin row can represent two independently flaggable entities. Hiding the whole row when only its affiliate is Test makes real client counts disagree with client management; flagging just the account when an admin intended to flag the affiliate leaves other commissions eligible for payout.

**How to apply:** Keep account and affiliate flags distinct in reports and admin controls, explicitly select the UUID of the entity being marked, and recheck both sides before transferring. Preserve historical payout and audit evidence, with an explicit admin review view for flagged records.