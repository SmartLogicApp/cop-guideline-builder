-- Additive affiliate compliance and payout workflow schema.
-- This migration creates new tables only. It does not alter or rewrite the
-- existing affiliates, affiliate_commissions, affiliate_payouts, or customer
-- history. It is safe to run more than once.

CREATE TABLE IF NOT EXISTS affiliate_compliance_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  state text,
  country text NOT NULL DEFAULT 'US',
  agreement_status text NOT NULL DEFAULT 'not_started',
  agreement_document_version text,
  privacy_status text NOT NULL DEFAULT 'not_started',
  privacy_document_version text,
  tax_status text NOT NULL DEFAULT 'not_started',
  payment_authorization_status text NOT NULL DEFAULT 'not_started',
  payment_authorization_version text,
  stripe_connected_account_id text,
  stripe_account_type text,
  stripe_onboarding_status text NOT NULL DEFAULT 'not_started',
  stripe_onboarding_started_at timestamptz,
  stripe_onboarding_completed_at timestamptz,
  stripe_charges_enabled boolean,
  stripe_payouts_enabled boolean NOT NULL DEFAULT false,
  stripe_details_submitted boolean NOT NULL DEFAULT false,
  stripe_requirements_due jsonb,
  stripe_tax_form_status text NOT NULL DEFAULT 'not_started',
  stripe_tax_form_last_checked_at timestamptz,
  stripe_account_last_synced_at timestamptz,
  ftc_acknowledgement_status text NOT NULL DEFAULT 'not_started',
  ftc_acknowledgement_version text,
  marketing_guidelines_status text NOT NULL DEFAULT 'not_started',
  marketing_guidelines_version text,
  admin_approval_status text NOT NULL DEFAULT 'pending',
  admin_hold_status text NOT NULL DEFAULT 'none',
  admin_hold_reason text,
  payout_eligibility_status text NOT NULL DEFAULT 'not_eligible',
  payout_eligibility_last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_compliance_status_affiliate_uidx
  ON affiliate_compliance_status(affiliate_id);
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_compliance_status_stripe_account_uidx
  ON affiliate_compliance_status(stripe_connected_account_id);
CREATE INDEX IF NOT EXISTS affiliate_compliance_status_tax_idx
  ON affiliate_compliance_status(tax_status);
CREATE INDEX IF NOT EXISTS affiliate_compliance_status_eligibility_idx
  ON affiliate_compliance_status(payout_eligibility_status);
CREATE INDEX IF NOT EXISTS affiliate_compliance_status_approval_idx
  ON affiliate_compliance_status(admin_approval_status);

CREATE TABLE IF NOT EXISTS affiliate_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL,
  version text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  effective_at timestamptz,
  published_at timestamptz,
  published_by_admin_id text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_document_versions_type_version_uidx
  ON affiliate_document_versions(document_type, version);
CREATE INDEX IF NOT EXISTS affiliate_document_versions_status_idx
  ON affiliate_document_versions(status);
CREATE INDEX IF NOT EXISTS affiliate_document_versions_type_status_idx
  ON affiliate_document_versions(document_type, status);

CREATE TABLE IF NOT EXISTS affiliate_document_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  document_version_id uuid NOT NULL REFERENCES affiliate_document_versions(id) ON DELETE RESTRICT,
  document_type text NOT NULL,
  document_version text NOT NULL,
  document_title text NOT NULL,
  document_url text,
  typed_legal_name text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  acceptance_method text NOT NULL,
  ip_address text,
  user_agent text,
  status text NOT NULL DEFAULT 'current'
    CHECK (status IN ('current', 'superseded', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS affiliate_document_acknowledgements_affiliate_idx
  ON affiliate_document_acknowledgements(affiliate_id);
CREATE INDEX IF NOT EXISTS affiliate_document_acknowledgements_version_idx
  ON affiliate_document_acknowledgements(document_version_id);
CREATE INDEX IF NOT EXISTS affiliate_document_acknowledgements_type_status_idx
  ON affiliate_document_acknowledgements(document_type, status);
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_document_acknowledgements_current_uidx
  ON affiliate_document_acknowledgements(affiliate_id, document_type)
  WHERE status = 'current';

CREATE TABLE IF NOT EXISTS affiliate_payment_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  authorization_version text NOT NULL,
  authorization_document_version_id uuid NOT NULL
    REFERENCES affiliate_document_versions(id) ON DELETE RESTRICT,
  typed_legal_name text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'current'
    CHECK (status IN ('current', 'superseded', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS affiliate_payment_authorizations_affiliate_idx
  ON affiliate_payment_authorizations(affiliate_id);
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_payment_authorizations_current_uidx
  ON affiliate_payment_authorizations(affiliate_id)
  WHERE status = 'current';

CREATE TABLE IF NOT EXISTS affiliate_payout_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  hold_type text NOT NULL,
  reason text NOT NULL,
  created_by_admin_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_by_admin_id text,
  released_at timestamptz,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'released'))
);
CREATE INDEX IF NOT EXISTS affiliate_payout_holds_affiliate_idx
  ON affiliate_payout_holds(affiliate_id);
CREATE INDEX IF NOT EXISTS affiliate_payout_holds_status_idx
  ON affiliate_payout_holds(status);
CREATE INDEX IF NOT EXISTS affiliate_payout_holds_type_status_idx
  ON affiliate_payout_holds(hold_type, status);

CREATE TABLE IF NOT EXISTS affiliate_compliance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  actor_type text NOT NULL
    CHECK (actor_type IN ('affiliate', 'admin', 'system', 'stripe_webhook')),
  actor_id text,
  event_type text NOT NULL,
  prior_value jsonb,
  new_value jsonb,
  reason text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS affiliate_compliance_audit_log_affiliate_idx
  ON affiliate_compliance_audit_log(affiliate_id);
CREATE INDEX IF NOT EXISTS affiliate_compliance_audit_log_actor_idx
  ON affiliate_compliance_audit_log(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS affiliate_compliance_audit_log_created_at_idx
  ON affiliate_compliance_audit_log(created_at);

-- A distinct workflow table is used instead of changing the established
-- affiliate_payouts quarterly ledger or its historic rows.
CREATE TABLE IF NOT EXISTS affiliate_payout_workflow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  payout_period_start timestamptz NOT NULL,
  payout_period_end timestamptz NOT NULL,
  gross_commission_amount numeric(14, 2) NOT NULL,
  adjustments_amount numeric(14, 2) NOT NULL DEFAULT 0,
  net_payout_amount numeric(14, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  payout_status text NOT NULL DEFAULT 'accrued'
    CHECK (payout_status IN (
      'accrued', 'pending_hold_period', 'payable_pending_compliance',
      'payable_pending_admin_approval', 'approved_for_payout',
      'payout_processing', 'paid', 'failed', 'reversed', 'withheld', 'voided'
    )),
  stripe_transfer_id text,
  idempotency_key text NOT NULL,
  approved_by_admin_id text,
  approved_at timestamptz,
  paid_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (payout_period_end >= payout_period_start)
);
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_payout_workflow_idempotency_uidx
  ON affiliate_payout_workflow(idempotency_key);
CREATE INDEX IF NOT EXISTS affiliate_payout_workflow_affiliate_idx
  ON affiliate_payout_workflow(affiliate_id);
CREATE INDEX IF NOT EXISTS affiliate_payout_workflow_status_idx
  ON affiliate_payout_workflow(payout_status);
CREATE INDEX IF NOT EXISTS affiliate_payout_workflow_created_at_idx
  ON affiliate_payout_workflow(created_at);

CREATE TABLE IF NOT EXISTS affiliate_tax_review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  tax_status text NOT NULL
    CHECK (tax_status IN (
      'not_started', 'submitted_to_stripe', 'verified_complete',
      'needs_correction', 'manual_review_required', 'not_applicable'
    )),
  decision_type text NOT NULL,
  reason text NOT NULL,
  reviewed_by_admin_id text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS affiliate_tax_review_decisions_affiliate_idx
  ON affiliate_tax_review_decisions(affiliate_id);
CREATE INDEX IF NOT EXISTS affiliate_tax_review_decisions_status_idx
  ON affiliate_tax_review_decisions(tax_status);
CREATE INDEX IF NOT EXISTS affiliate_tax_review_decisions_created_at_idx
  ON affiliate_tax_review_decisions(created_at);

CREATE TABLE IF NOT EXISTS affiliate_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_by_admin_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_email_templates_key_uidx
  ON affiliate_email_templates(template_key);
CREATE INDEX IF NOT EXISTS affiliate_email_templates_enabled_idx
  ON affiliate_email_templates(enabled);

-- Seed the exact initial acknowledgement language and guidelines as published
-- document versions. No Affiliate Partner Agreement is seeded or marked
-- approved by this migration.
INSERT INTO affiliate_document_versions
  (document_type, version, title, content, effective_at, published_at, published_by_admin_id, status)
VALUES
  (
    'ftc_disclosure',
    '1.0',
    'FTC Affiliate Disclosure Acknowledgement',
    $ftc$I understand that I may receive commissions when someone subscribes to CMS Compliance Guardian through my affiliate referral link or referral code. I agree to clearly and conspicuously disclose this financial relationship whenever I endorse, recommend, review, promote, or link to CMS Compliance Guardian, including in social media posts, videos, blogs, emails, presentations, advertisements, and other promotional communications.

I will place the disclosure close to the endorsement or referral link, use clear language that an ordinary person can understand, and will not hide the disclosure in a profile, footer, hashtag group, terms page, or 'more' link.

An example disclosure is: 'I may earn a commission if you subscribe through my link or use my referral code.'

I understand that I may not make false, misleading, unsubstantiated, or guaranteed claims about CMS Compliance Guardian, survey outcomes, accreditation, regulatory compliance, CMS, The Joint Commission, DNV, or any healthcare organization.$ftc$,
    now(), now(), 'system:initial-seed', 'published'
  ),
  (
    'payment_authorization',
    '1.0',
    'Payment Authorization',
    $payment$By selecting Continue to secure payment setup, I authorize CMS Compliance Guardian LLC to send approved affiliate commission payments to the payout account that I securely establish and maintain through Stripe. I confirm that I am authorized to receive payments to that account, that the payee information I provide is accurate, and that CMS Compliance Guardian LLC may correct, reverse, offset, or recover a payment when required because of an error, refund, chargeback, fraud, duplicate payment, or violation of the Affiliate Partner Agreement. This authorization does not guarantee payment and is subject to the Affiliate Partner Agreement and payout eligibility rules.$payment$,
    now(), now(), 'system:initial-seed', 'published'
  ),
  (
    'marketing_guidelines',
    '1.0',
    'CMS Compliance Guardian Affiliate Marketing and Brand Guidelines',
    $marketing$CMS Compliance Guardian Affiliate Marketing and Brand Guidelines

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
CMS Compliance Guardian may request edits, removal of content, suspension of referral links, withholding of unpaid commissions where permitted by the Affiliate Partner Agreement, or termination from the program for a violation of these guidelines.$marketing$,
    now(), now(), 'system:initial-seed', 'published'
  )
ON CONFLICT (document_type, version) DO NOTHING;

-- Editable Admin email-template starting points. Templates contain no tax,
-- bank, or secret data and do not promise a payout.
INSERT INTO affiliate_email_templates (template_key, subject, body)
VALUES
  ('complete_payout_setup', 'Complete your payout setup', E'Hello {{affiliate_name}},\n\nPlease visit {{portal_url}} to complete your affiliate payout setup. Incomplete items: {{incomplete_items}}.\n\nPayouts are subject to eligibility review and are not guaranteed.'),
  ('tax_information_action', 'Action required: complete W-9/tax information', E'Hello {{affiliate_name}},\n\nPlease complete your secure tax-information step through {{portal_url}}. Incomplete items: {{incomplete_items}}.\n\nDo not send tax identification information by email.'),
  ('stripe_payment_setup_action', 'Action required: complete Stripe payment setup', E'Hello {{affiliate_name}},\n\nPlease complete secure payment setup from {{portal_url}}. Incomplete items: {{incomplete_items}}.\n\nPayouts are subject to eligibility review and are not guaranteed.'),
  ('ftc_acknowledgement_action', 'Action required: accept FTC disclosure acknowledgement', E'Hello {{affiliate_name}},\n\nPlease review and accept the FTC disclosure acknowledgement at {{portal_url}}. Incomplete items: {{incomplete_items}}.'),
  ('marketing_acknowledgement_action', 'Action required: accept marketing and brand guidelines', E'Hello {{affiliate_name}},\n\nPlease review and accept the current marketing and brand guidelines at {{portal_url}}. Incomplete items: {{incomplete_items}}.'),
  ('payout_setup_complete', 'Your payout setup is complete', E'Hello {{affiliate_name}},\n\nYour payout setup checklist is complete. Visit {{portal_url}} to view your current status. Any payout remains subject to eligibility review and is not guaranteed.'),
  ('payout_eligibility_paused', 'Payout eligibility paused', E'Hello {{affiliate_name}},\n\nYour payout eligibility is paused. Visit {{portal_url}} to review your status and incomplete items: {{incomplete_items}}.'),
  ('updated_document_acknowledgement', 'Updated affiliate document requires your acknowledgement', E'Hello {{affiliate_name}},\n\nAn updated affiliate document requires your review and acknowledgement. Visit {{portal_url}}. Incomplete items: {{incomplete_items}}.')
ON CONFLICT (template_key) DO NOTHING;