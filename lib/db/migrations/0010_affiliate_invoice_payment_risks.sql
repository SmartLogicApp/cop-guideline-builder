CREATE TABLE IF NOT EXISTS affiliate_invoice_payment_risks (
  stripe_invoice_id text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  affiliate_id uuid REFERENCES affiliates(id) ON DELETE RESTRICT,
  stripe_charge_id text NOT NULL,
  stripe_payment_intent_id text,
  charge_amount_minor integer NOT NULL,
  cumulative_refunded_minor integer NOT NULL DEFAULT 0,
  dispute_id text,
  dispute_status text NOT NULL DEFAULT 'none',
  prior_commission_status text,
  manual_recovery_review_required boolean NOT NULL DEFAULT false,
  recovery_review_reason text,
  last_stripe_event_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_invoice_payment_risks_amount_check
    CHECK (charge_amount_minor > 0 AND cumulative_refunded_minor >= 0 AND cumulative_refunded_minor <= charge_amount_minor),
  CONSTRAINT affiliate_invoice_payment_risks_dispute_status_check
    CHECK (dispute_status IN ('none', 'open', 'won', 'lost')),
  CONSTRAINT affiliate_invoice_payment_risks_prior_status_check
    CHECK (prior_commission_status IS NULL OR prior_commission_status IN ('pending', 'payable'))
);

CREATE INDEX IF NOT EXISTS affiliate_invoice_payment_risks_affiliate_idx
  ON affiliate_invoice_payment_risks (affiliate_id);
CREATE INDEX IF NOT EXISTS affiliate_invoice_payment_risks_account_idx
  ON affiliate_invoice_payment_risks (account_id);

CREATE TABLE IF NOT EXISTS affiliate_payment_risk_events (
  stripe_event_id text PRIMARY KEY,
  stripe_invoice_id text NOT NULL REFERENCES affiliate_invoice_payment_risks(stripe_invoice_id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  event_created_at timestamptz NOT NULL,
  charge_amount_minor integer NOT NULL,
  cumulative_refunded_minor integer NOT NULL,
  dispute_id text,
  dispute_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_payment_risk_events_type_check
    CHECK (event_type IN (
      'charge.refunded',
      'charge.dispute.created',
      'charge.dispute.updated',
      'charge.dispute.closed',
      'charge.dispute.funds_reinstated',
      'charge.dispute.funds_withdrawn'
    )),
  CONSTRAINT affiliate_payment_risk_events_amount_check
    CHECK (charge_amount_minor > 0 AND cumulative_refunded_minor >= 0 AND cumulative_refunded_minor <= charge_amount_minor),
  CONSTRAINT affiliate_payment_risk_events_dispute_status_check
    CHECK (dispute_status IS NULL OR dispute_status IN ('none', 'open', 'won', 'lost'))
);

CREATE INDEX IF NOT EXISTS affiliate_payment_risk_events_invoice_idx
  ON affiliate_payment_risk_events (stripe_invoice_id);