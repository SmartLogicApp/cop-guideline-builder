Add a secure Affiliate Compliance and Payout Onboarding workflow to the existing CMS Compliance Guardian / CoP Guideline Builder app.

This is an additive feature only. Do not remove, rename, redesign, or break any existing customer, subscription, admin, referral, partner, or affiliate features. Preserve the current database and use safe migrations only. Do not rebuild or wipe existing tables.

The purpose is to ensure that no affiliate can receive a commission payout until all required compliance, tax, payment, and marketing acknowledgements are complete and approved.

IMPORTANT SECURITY RULES

1. Never collect, store, display, log, email, or expose a full Social Security number, full EIN, bank account number, bank routing number, debit card number, Stripe secret key, or Stripe webhook secret in the app database, UI, logs, analytics, browser local storage, or email.

2. Do not create custom input fields for W-9 TIN/SSN/EIN or bank details.

3. Use Stripe-hosted onboarding through Stripe Connect Express or Stripe Connect Account Links for payout/payment details and, where enabled, W-9 tax-information collection. Stripe must securely collect and retain sensitive tax and bank information.

4. Keep all Stripe API keys, Connect client identifiers, webhook secrets, and internal encryption keys in Replit Secrets/environment variables only. Never hard-code any secret.

5. Require authenticated affiliate access to all portal routes. Only the affiliate may view their own compliance status. Admin users may see status, timestamps, audit logs, and Stripe account status, but may not see raw W-9 tax identification information or bank-account details.

6. Use a migration-based database update. Do not delete, truncate, or alter existing referral, affiliate, customer, subscription, or commission history.

7. Before executing a real payout, the application must re-check all payout eligibility conditions on the server. Do not rely only on front-end status indicators.

BUSINESS RULES

CMS Compliance Guardian LLC operates a nationwide Affiliate Partner Program.

Affiliate commission model:
- 20% recurring commission
- Commission is payable only for eligible, paid, active referred customer subscriptions
- Commission calculation and the existing referral/commission logic must remain intact unless a change is specifically required below
- No payout may be created, marked payable, sent, or manually overridden unless the affiliate's payout eligibility is TRUE

Required conditions for payout eligibility:
1. Affiliate account is active and approved by an Admin
2. Affiliate has accepted the current Affiliate Partner Agreement
3. Affiliate has accepted the current Privacy Notice / Privacy Policy
4. Affiliate has completed Stripe Connect onboarding and has a valid connected payout account
5. Affiliate has submitted required U.S. tax information through Stripe-hosted W-9 collection, or has an Admin-approved non-U.S. tax status workflow when that feature is later enabled
6. Affiliate has accepted the FTC Affiliate Disclosure Acknowledgement
7. Affiliate has accepted the Marketing and Brand Guidelines
8. Affiliate has no active compliance hold, fraud hold, tax hold, payout hold, or termination status
9. Any required minimum payout threshold has been met
10. Any commission hold/refund/chargeback window configured in the app has passed

For the initial launch, support U.S.-based affiliates only:
- Collect state and country during application/onboarding
- If country is not United States, mark the affiliate as "International review required"
- Do not enable a payout for an international affiliate
- Show a clear message that international affiliate payment setup is not yet available
- Do not ask international affiliates for a W-9
- Build the database so W-8 support can be added later without redesigning the data model

AFFILIATE PORTAL

Create or extend the authenticated affiliate portal route:
- /partners/portal
or preserve the existing route if it already exists.

Add a dashboard card titled:
"Payout setup and compliance"

Show a progress checklist with these exact required steps:
1. Affiliate Partner Agreement
2. Privacy Notice
3. Tax information (W-9)
4. Payment setup
5. FTC affiliate disclosure acknowledgement
6. Marketing and brand guidelines acknowledgement
7. Admin approval

For every step, show one of these statuses:
- Not started
- Action needed
- Submitted
- Complete
- Under review
- Needs correction
- Not eligible
- Admin hold

Show a clear overall status:
- "Not eligible for payouts"
- "Pending approval"
- "Eligible for payouts"
- "Payouts paused"
- "International review required"

Do not call the affiliate an employee, representative, agent, franchisee, or partner in any legal sense. Use "Affiliate Partner" as the program name only.

SECTION A: AGREEMENT AND PRIVACY RECORDS

If agreement and privacy-policy acceptance already exist, preserve them and use them in the eligibility engine.

Create versioned acknowledgement records for:
- Affiliate Partner Agreement
- Privacy Notice / Privacy Policy
- FTC Affiliate Disclosure Acknowledgement
- Marketing and Brand Guidelines

Each acknowledgement record must capture:
- affiliate_id
- document_type
- document_version
- document_title
- document_url or immutable stored document reference
- accepted_at timestamp in UTC
- acceptance_method, such as checkbox plus typed full legal name or e-sign acknowledgment
- IP address if already safely supported by the application infrastructure
- user agent if already safely supported
- current/revoked/superseded status
- created_at and updated_at

Do not allow a simple checkbox by itself to count as a completed acknowledgement. Require:
- A required checkbox stating the affiliate has read and agrees to the document
- A typed legal name confirmation
- A required date/time stamp generated by the system
- A link to view/download the current document version before submitting

If a document changes to a new version:
- Mark prior acknowledgement as superseded, not deleted
- Set payout eligibility to false until the affiliate accepts the current version
- Prompt the affiliate in the portal to review and re-accept the updated document
- Add an Admin audit-log entry showing the version change and affected affiliates

SECTION B: STRIPE CONNECT PAYOUT AND TAX ONBOARDING

Determine whether Stripe Connect is already configured in this Replit app.

If Stripe Connect is NOT configured:
- Add a Stripe Connect integration using Stripe Express connected accounts and Stripe Account Links
- Do not use Stripe Standard accounts unless there is already a deliberate existing architecture that requires them
- Create one connected account per approved affiliate
- Store only non-sensitive Stripe identifiers and status metadata, such as:
  - stripe_connected_account_id
  - stripe_account_type
  - stripe_onboarding_started_at
  - stripe_onboarding_completed_at
  - stripe_charges_enabled
  - stripe_payouts_enabled
  - stripe_details_submitted
  - stripe_requirements_due JSON metadata only if it contains no sensitive information
  - stripe_tax_form_status
  - stripe_tax_form_last_checked_at
  - stripe_account_last_synced_at
- Never store W-9 PDF files, TINs, SSNs, EINs, raw bank details, or Stripe onboarding URLs after they expire

Affiliate portal behavior:
- Display a "Set up secure payments and tax information" button
- On click, call the server to create or reuse the affiliate's Stripe Connect Express account
- Create a time-limited Stripe Account Link and redirect the affiliate to Stripe-hosted onboarding
- Stripe should collect identity verification, bank payout details, and, if the configured Stripe Connect tax feature supports it, W-9 tax information
- Set return_url to a secure authenticated route such as:
  /partners/portal/payout-return
- Set refresh_url to a secure authenticated route such as:
  /partners/portal/payout-refresh
- On return, retrieve the connected account status from Stripe server-side and update the non-sensitive metadata in the application database
- Show the affiliate only a status summary, never raw tax or bank information
- Give the affiliate a button to return to Stripe onboarding when additional information is required

Tax status rules:
- For a U.S. affiliate, do not mark tax information complete merely because a Stripe connected account exists
- Mark tax information complete only if Stripe confirms the configured W-9/tax reporting requirement is satisfied, or if an Admin performs a documented manual compliance review in a dedicated temporary/manual exception workflow
- Create an Admin-configurable "W-9/tax status" with:
  - Not started
  - Submitted to Stripe
  - Verified/complete
  - Needs correction
  - Manual review required
  - Not applicable
- The server-side payout eligibility service must require "Verified/complete" for U.S. affiliates

Payment authorization language in the portal:
Display this acknowledgement immediately before the affiliate begins Stripe onboarding:

"By selecting Continue to secure payment setup, I authorize CMS Compliance Guardian LLC to send approved affiliate commission payments to the payout account that I securely establish and maintain through Stripe. I confirm that I am authorized to receive payments to that account, that the payee information I provide is accurate, and that CMS Compliance Guardian LLC may correct, reverse, offset, or recover a payment when required because of an error, refund, chargeback, fraud, duplicate payment, or violation of the Affiliate Partner Agreement. This authorization does not guarantee payment and is subject to the Affiliate Partner Agreement and payout eligibility rules."

Require:
- required checkbox
- typed legal name
- system-generated timestamp
- version number for this payment authorization language
- immutable audit record

Do not treat the payment authorization acknowledgement as proof of valid bank details. Stripe Connect account and payout status is the authoritative payment setup source.

SECTION C: FTC AFFILIATE DISCLOSURE ACKNOWLEDGEMENT

Create a required portal step named:
"FTC affiliate disclosure acknowledgement"

Display this acknowledgement:

"I understand that I may receive commissions when someone subscribes to CMS Compliance Guardian through my affiliate referral link or referral code. I agree to clearly and conspicuously disclose this financial relationship whenever I endorse, recommend, review, promote, or link to CMS Compliance Guardian, including in social media posts, videos, blogs, emails, presentations, advertisements, and other promotional communications.

I will place the disclosure close to the endorsement or referral link, use clear language that an ordinary person can understand, and will not hide the disclosure in a profile, footer, hashtag group, terms page, or 'more' link.

An example disclosure is: 'I may earn a commission if you subscribe through my link or use my referral code.'

I understand that I may not make false, misleading, unsubstantiated, or guaranteed claims about CMS Compliance Guardian, survey outcomes, accreditation, regulatory compliance, CMS, The Joint Commission, DNV, or any healthcare organization."

Require:
- checkbox confirming the affiliate read and agrees
- typed legal name
- system timestamp
- document version
- acknowledgement stored in the versioned acknowledgement table
- current completion status visible in the affiliate portal
- current completion status visible to Admin

SECTION D: MARKETING AND BRAND GUIDELINES

Create a required portal step named:
"Marketing and brand guidelines"

Create an editable Admin-managed document page for the current guidelines:
- /partners/marketing-guidelines
- Make the content versioned
- Keep historical versions read-only for audit purposes
- Admin may create a draft, preview it, publish it, and set the effective date
- Publishing a new version should require affiliates to re-acknowledge it before future payouts are eligible

Use this initial guideline content. Store it so an Admin can edit and publish updates later:

CMS Compliance Guardian Affiliate Marketing and Brand Guidelines

1. Affiliate relationship and disclosure
You must clearly disclose that you may earn a commission when promoting CMS Compliance Guardian. Place the disclosure close to the recommendation, referral link, or referral code.

2. Accurate claims only
You may accurately describe approved CMS Compliance Guardian features and your honest experience. You may not make false, misleading, deceptive, or unsubstantiated statements.

3. No guarantees or official affiliation claims
Do not state or imply that CMS Compliance Guardian:
- guarantees survey readiness, compliance, accreditation, certification, reimbursement, or a successful survey result
- replaces legal, clinical, accreditation, or professional judgment
- is endorsed by, affiliated with, approved by, or acting on behalf of CMS, The Joint Commission, DNV, or any government agency, unless CMS Compliance Guardian provides express written authorization
- provides official legal, regulatory, accreditation, or clinical advice

4. Approved product positioning
You may describe CMS Compliance Guardian as a compliance-support and workflow platform intended to help consultants and healthcare organizations organize survey-readiness work, research standards and expectations, develop policies and documentation, and support preparation activities.

5. Healthcare referral restriction
You may not use the affiliate program to solicit, reward, induce, influence, or compensate patient referrals, admissions, clinical referrals, federally reimbursable healthcare business, or any other activity prohibited by applicable healthcare fraud-and-abuse, anti-kickback, patient-brokering, fee-splitting, or similar laws.

6. No unauthorized promises or contracting
You may not bind CMS Compliance Guardian to a contract, change pricing, make custom offers, collect payment, issue refunds, negotiate terms on behalf of CMS Compliance Guardian, or represent that you have authority to act for CMS Compliance Guardian.

7. Brand and intellectual-property use
Use only current logos, screenshots, product descriptions, links, names, and marketing assets supplied or approved by CMS Compliance Guardian. Do not modify logos, create confusingly similar names, register domains or social-media handles using CMS Compliance Guardian trademarks, or claim ownership of CMS Compliance Guardian content.

8. Communications and privacy
Do not send spam, use purchased contact lists, make unlawful robocalls, send unlawful text messages, or violate email, text-message, advertising, privacy, or platform rules. Do not submit, disclose, upload, or transmit patient information, protected health information, customer credentials, or confidential customer information through the affiliate program.

9. Review and enforcement
CMS Compliance Guardian may request edits, removal of content, suspension of referral links, withholding of unpaid commissions where permitted by the Affiliate Partner Agreement, or termination from the program for a violation of these guidelines.

Below the guidelines, require an acknowledgement:

"I have read, understand, and agree to comply with the CMS Compliance Guardian Affiliate Marketing and Brand Guidelines. I understand that failure to comply may result in suspension, loss of payout eligibility, reversal or withholding of commissions as permitted by the Affiliate Partner Agreement, or termination from the program."

Require checkbox, typed legal name, document version, and timestamp.

SECTION E: ADMIN COMPLIANCE AND PAYOUT CONSOLE

Create or extend an Admin-only route:
- /admin/affiliates
- /admin/affiliates/[affiliateId]
- /admin/affiliate-compliance
- /admin/affiliate-payouts

Only users with verified Admin authorization may access these routes. Enforce authorization server-side, not only by hiding navigation.

Admin affiliate list:
Show searchable/filterable columns:
- Affiliate legal name
- Business name
- Email
- State
- Country
- Affiliate status
- Referral code
- Commission balance
- Agreement status
- Privacy status
- W-9/tax status
- Stripe payout status
- Payment authorization status
- FTC acknowledgement status
- Marketing guidelines status
- Overall payout eligibility
- Admin hold status
- Last updated date

Create filters for:
- Eligible for payout
- Not eligible for payout
- Missing W-9/tax status
- Stripe setup incomplete
- Missing payment authorization
- Missing FTC acknowledgement
- Missing marketing acknowledgement
- Under review
- Admin hold
- International review required
- Terminated/inactive

Affiliate detail page:
Show:
- Affiliate profile and contact information
- Referral code and referral performance
- Commission history and payable balance
- Detailed compliance checklist
- Current and historical versioned acknowledgements
- Stripe Connect non-sensitive status
- Tax status only, never TIN or a W-9 PDF
- Payment authorization acceptance record
- FTC acknowledgement acceptance record
- Marketing guideline acknowledgement record
- Holds, notes, review decisions, and audit history
- Buttons to send a secure reminder email for incomplete tasks
- Buttons to place/remove a payout hold with mandatory Admin reason
- Buttons to approve, reject, suspend, terminate, or reactivate the affiliate
- A clearly labeled "Re-check payout eligibility" server-side action

Admin actions must create immutable audit-log entries with:
- action type
- affiliate_id
- admin_user_id
- date/time in UTC
- previous status
- new status
- reason/notes
- document version where relevant

No Admin screen may display:
- SSN
- EIN
- TIN
- full W-9
- bank account numbers
- routing numbers
- Stripe secret keys
- Stripe webhook secrets

SECTION F: PAYOUT GATE AND COMMISSION WORKFLOW

Build a single server-side function/service:
- calculateAffiliatePayoutEligibility(affiliateId)

It must return:
- eligible: true or false
- overall_status
- blocking_reasons array
- compliance_status snapshot
- checked_at

It must evaluate every required eligibility condition listed in this instruction.

Use this function in all payout-related actions:
- Admin payout list
- Generate payout batch
- Approve payout
- Send payout
- Mark payout paid
- Stripe transfer creation
- Any future automated payout job
- Any existing manual payout workflow

If eligibility is false:
- Block the action on the server
- Display the exact blocking reasons to the Admin
- Do not create a Stripe transfer
- Do not mark the commission paid
- Do not reduce the affiliate's payable balance
- Record the attempted payout block in the audit log

Payout status values:
- Accrued
- Pending hold period
- Payable pending compliance
- Payable pending Admin approval
- Approved for payout
- Payout processing
- Paid
- Failed
- Reversed
- Withheld
- Voided

Payment controls:
- Require an Admin review before the first payout to every affiliate
- Require a second confirmation modal before sending any real payout
- Show in the confirmation modal:
  - affiliate legal name
  - affiliate ID
  - total commission amount
  - payout period
  - Stripe connected account ID masked except last four characters
  - all compliance checks marked complete
  - Admin confirmation that the payout is authorized
- Do not add automatic payouts unless explicitly requested in a later build instruction
- Begin with manual, Admin-approved payouts only

Stripe payout architecture:
- If Stripe Connect is implemented, use the appropriate Stripe Connect payout/transfer mechanism based on the existing customer-payment architecture
- Do not transfer funds until the server-side eligibility function approves the affiliate
- Use idempotency keys for every payment initiation to prevent duplicate payouts
- Save only non-sensitive transaction identifiers, amount, currency, status, timestamps, payout period, and error messages
- Implement Stripe webhooks to update payout outcome status securely
- Verify webhook signatures using a secret stored in Replit Secrets
- Make webhook handlers idempotent
- Do not expose webhook endpoints or secret details in the user interface

SECTION G: DATABASE TABLES OR EQUIVALENT MODELS

Use the existing naming conventions and database technology. Add equivalent safe migration-backed models as needed:

1. affiliate_compliance_status
- id
- affiliate_id unique
- agreement_status
- agreement_document_version
- privacy_status
- privacy_document_version
- tax_status
- payment_authorization_status
- payment_authorization_version
- stripe_connected_account_id
- stripe_account_type
- stripe_onboarding_status
- stripe_payouts_enabled
- stripe_details_submitted
- ftc_acknowledgement_status
- ftc_acknowledgement_version
- marketing_guidelines_status
- marketing_guidelines_version
- admin_approval_status
- admin_hold_status
- admin_hold_reason
- payout_eligibility_status
- payout_eligibility_last_checked_at
- created_at
- updated_at

2. affiliate_document_versions
- id
- document_type
- version
- title
- content or secure content reference
- effective_at
- published_at
- published_by_admin_id
- status: draft, published, retired
- created_at
- updated_at

3. affiliate_document_acknowledgements
- id
- affiliate_id
- document_version_id
- document_type
- typed_legal_name
- accepted_at
- acceptance_method
- ip_address only if safely supported
- user_agent only if safely supported
- status: current, superseded, revoked
- created_at
- updated_at

4. affiliate_payment_authorizations
- id
- affiliate_id
- authorization_version
- typed_legal_name
- accepted_at
- status
- created_at
- updated_at

5. affiliate_payout_holds
- id
- affiliate_id
- hold_type
- reason
- created_by_admin_id
- created_at
- released_by_admin_id
- released_at
- status

6. affiliate_compliance_audit_log
- id
- affiliate_id
- actor_type: affiliate, admin, system, Stripe webhook
- actor_id nullable
- event_type
- prior_value JSON
- new_value JSON
- reason
- metadata JSON with no sensitive financial or tax data
- created_at

7. affiliate_payouts
- id
- affiliate_id
- payout_period_start
- payout_period_end
- gross_commission_amount
- adjustments_amount
- net_payout_amount
- currency
- payout_status
- Stripe transfer/payment ID if applicable
- idempotency_key
- approved_by_admin_id
- approved_at
- paid_at
- failure_reason
- created_at
- updated_at

Add indexes for affiliate_id, payout status, compliance/payout eligibility status, Stripe connected account ID, and created_at where appropriate.

SECTION H: EMAILS AND REMINDERS

Create editable email templates and an Admin-send capability for:
- Complete your payout setup
- Action required: complete W-9/tax information
- Action required: complete Stripe payment setup
- Action required: accept FTC disclosure acknowledgement
- Action required: accept marketing and brand guidelines
- Your payout setup is complete
- Payout eligibility paused
- Updated affiliate document requires your acknowledgement

Each email must include:
- Affiliate's first name or legal name if available
- A secure link to /partners/portal
- A concise list of incomplete items
- No SSN, EIN, TIN, bank account, or Stripe secret information
- No claim that payment is guaranteed

SECTION I: UI, ACCESSIBILITY, AND TESTING

UI requirements:
- Make the affiliate portal mobile responsive
- Use clear, plain-English status language
- Show a "Why can't I be paid yet?" panel listing exact missing requirements
- Provide a help/support link for affiliate questions
- Do not make legal documents editable by the affiliate
- Require authentication and server-side access control for all affiliate and Admin routes

Testing requirements:
Create automated tests or documented end-to-end test cases for:
1. New U.S. affiliate cannot be paid with no documents or Stripe setup
2. Affiliate accepts agreement, privacy, FTC, marketing, and payment authorization but still cannot be paid until W-9/tax and Stripe payment setup are complete
3. Stripe onboarding completion changes non-sensitive status correctly
4. Affiliate becomes eligible only after all required statuses are complete and Admin approval exists
5. An Admin hold blocks payout immediately
6. A newly published FTC or marketing-guideline version makes previously eligible affiliates ineligible until they re-acknowledge
7. International affiliate is blocked and marked "International review required"
8. Unauthorized users cannot access Admin records
9. An affiliate cannot access another affiliate's documents or status
10. Sensitive W-9 and bank details cannot be displayed, logged, exported, or accessed from Admin UI
11. Attempted payout for an ineligible affiliate is blocked server-side
12. Stripe webhook processing is verified and idempotent
13. Duplicate payout request cannot create duplicate payment

FINAL DELIVERY

After implementation:
1. Run migrations safely
2. Test the complete onboarding path using Stripe test mode only
3. Do not initiate a live payout
4. Provide a concise build summary
5. Provide every Replit Secret / environment variable that must be added, with the exact variable name and a non-sensitive explanation of where to obtain it
6. Identify any Stripe Dashboard settings, Stripe Connect capabilities, webhook events, or Stripe product configuration that must be enabled manually
7. Identify any parts that require an attorney, CPA, or human Admin review before production launch
8. Do not claim W-9 or 1099 compliance is complete unless the actual Stripe Connect tax features and the Stripe account configuration have been verified

ARCHITECTURE NOTE:
This app owns: affiliate application, agreement/privacy/FTC/marketing acceptances, legal-document versions, affiliate approval, referral attribution, commission calculation, payout holds, approval workflow, audit log, eligibility engine, and admin console.
Stripe Connect Express owns: secure bank-account collection, identity/onboarding requirements, payout destination, and, if enabled, W-9/W-8 tax collection and tax-reporting support.
Admin owns: approving affiliates, checking exceptions, releasing holds, approving each payout, and monitoring affiliate marketing.
Do not build a plain W-9 upload field as the primary solution. A plain PDF upload may still contain a Social Security number or EIN, creating a higher security burden. Stripe-hosted onboarding is safer because the app records only a status such as "tax information complete," while Stripe handles the sensitive form and payout credentials.
