# Affiliate payout Section I test plan

The API server's `node --test src/**/*.test.ts` suite contains pure eligibility
tests and source-contract tests in
`src/lib/affiliate-payout-spec-contract.test.ts`. Those run without a database,
Stripe API calls, or production credentials. They verify rule decisions and
critical authorization, payout, webhook, and schema contracts, but they are
not substitutes for exercising Express handlers against a database.

The route handlers use the shared Drizzle database module and a Stripe test
client directly. The route handlers cannot be executed as isolated integration
tests here without replacing application-wide database/auth dependencies or
providing a disposable migrated database. No production database or live
Stripe account should be used for these cases. Run the following E2E cases
against an isolated test database seeded with synthetic affiliate records and
a mocked Stripe Connect test client (or Stripe test mode only). Reset that
database before and after each case. Do not seed real tax or bank details.

| Spec case | Setup and action | Expected result |
| --- | --- | --- |
| I.1 | Create a pending U.S. affiliate with no acknowledgements, tax verification, payment authorization, or connected account; request a payout draft. | Server denies payout with blocking reasons; no payout transfer or commission settlement occurs. |
| I.2 | Accept the current agreement, privacy notice, FTC and marketing documents, and payment authorization; leave W-9/tax verification and Stripe payment setup incomplete; request a payout. | Server still denies payout for missing verified tax and Stripe Express payment setup. |
| I.3 | Complete Stripe Express test onboarding and deliver a signed `account.updated` event. | Non-sensitive account metadata reflects submitted details, enabled payouts, onboarding status, and due requirements. Tax status remains unchanged unless Stripe tax evidence or a documented approved review separately verifies it. |
| I.4 | Set all current acknowledgements, payment authorization, verified U.S. tax status, Express account details and payouts, active/approved affiliate status, Admin approval, sufficient payable balance, and no holds; request eligibility and draft payout. | Eligibility is true and the draft is allowed. Every failed precondition in turn must make it false. |
| I.5 | Start from the eligible fixture; place an active hold and request approval/send. | The operation is blocked immediately with the hold reason; no transfer is requested and no commission is marked paid. |
| I.6 | Make an eligible affiliate's acknowledged FTC or marketing document version obsolete by publishing a new effective version; request eligibility; re-acknowledge and retry. | Before re-acknowledgement eligibility is false; it becomes true only after acceptance of the newly current version. |
| I.7 | Submit a non-U.S. country and attempt to start tax/payment setup and request a payout. | Status is `international_review_required`; payout is blocked and no W-9 collection or Stripe onboarding link is initiated. |
| I.8 | Call Admin list, detail, approval, draft, and send endpoints as unauthenticated and ordinary non-Admin users. | Requests receive the appropriate 401/403 response and reveal no Admin record. |
| I.9 | Authenticate as affiliate A and request affiliate B's portal status, documents, acknowledgements, payment authorization, and Connect actions. | Affiliate A can access only A's records/actions; B's records are not returned or modified. |
| I.10 | Seed synthetic compliance statuses and audit records, then load and export Admin detail/list views. | Only non-sensitive status and identifiers are visible. No TIN/SSN/EIN, W-9 contents, full bank/routing/card number, or Stripe secret appears in response bodies, exports, or logs. |
| I.11 | Make an affiliate ineligible, then invoke modern draft/approve/send and legacy create/mark-approved/mark-paid payout endpoints. | Each server-side operation denies the request, audits the block, and leaves payout status and payable commission balances unchanged. |
| I.12 | Deliver a validly signed test Connect event, an invalid-signature event, and duplicate/reordered terminal transfer events. | A valid event is applied once; invalid signatures are rejected; duplicate terminal events are no-ops and do not duplicate ledger changes. |
| I.13 | Submit two payout requests for the same affiliate and period concurrently, then retry a send after an uncertain Stripe response. | Only one payout/transfer is created; the database uniqueness guard and same persisted Stripe idempotency key prevent a duplicate charge/transfer. |

These integration cases must use test credentials and disposable data only.
Never initiate a live payout as part of this plan.