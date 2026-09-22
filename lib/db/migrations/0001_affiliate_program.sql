-- ════════════════════════════════════════════════════════════════════════════
-- AFFILIATE PROGRAM — schema migration
-- ════════════════════════════════════════════════════════════════════════════
--
-- Run this against the DEV database first, then the PRODUCTION database.
--
-- Every statement is IF NOT EXISTS, so running it twice is harmless and running
-- it on a database that already has some of these objects is harmless too.
--
-- NOTHING HERE DROPS, ALTERS OR RENAMES AN EXISTING COLUMN. The only change to
-- an existing table is one added nullable column on `accounts`. If you see this
-- script try to do anything else, stop.
--
-- Written as plain SQL rather than left to `drizzle-kit push` on purpose: push
-- diffs the WHOLE schema and can propose destructive changes to unrelated
-- tables when a database has drifted. This touches only what it names.

-- ── 1. Referral attribution on accounts ─────────────────────────────────────
-- Captured from ?ref= at registration and never changed afterwards.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS referral_code text;

-- ── 2. Affiliates ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS affiliates (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code               text UNIQUE NOT NULL,
  company_name                text NOT NULL,
  contact_name                text,
  email                       text NOT NULL,
  phone                       text,
  clerk_user_id               text UNIQUE,
  status                      text NOT NULL DEFAULT 'pending',
  commission_rate_pct         integer NOT NULL DEFAULT 20,
  rate_effective_at           timestamptz DEFAULT now(),
  last_qualifying_referral_at timestamptz,
  enrollment_signed_at        timestamptz,
  enrollment_version          text,
  agreement_version           text,
  tax_info_received_at        timestamptz,
  payout_method               text,
  payout_reference            text,
  subscription_fee_waived     boolean NOT NULL DEFAULT false,
  admin_notes                 text,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS affiliates_status_idx ON affiliates (status);
CREATE INDEX IF NOT EXISTS affiliates_email_idx  ON affiliates (email);

-- ── 3. Commission ledger ────────────────────────────────────────────────────
-- The UNIQUE on stripe_invoice_id is the duplicate-payment defence. Stripe
-- redelivers webhooks; without this constraint a redelivery pays the affiliate
-- twice and nobody notices until a quarterly payout is wrong.
--
-- ON DELETE RESTRICT on both foreign keys, unlike the cascades elsewhere in
-- this database: deleting an account that has accrued commissions must fail
-- loudly rather than silently rewrite an affiliate's payout history.
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id           uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  account_id             uuid NOT NULL REFERENCES accounts(id)   ON DELETE RESTRICT,
  stripe_invoice_id      text UNIQUE,
  qualifying_revenue_usd double precision NOT NULL DEFAULT 0,
  rate_pct               integer NOT NULL,
  commission_usd         double precision NOT NULL DEFAULT 0,
  status                 text NOT NULL DEFAULT 'pending',
  accrued_at             timestamptz NOT NULL DEFAULT now(),
  payable_at             timestamptz NOT NULL,
  payout_id              uuid,
  paid_at                timestamptz,
  reversed_at            timestamptz,
  reversal_reason        text,
  source                 text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS affiliate_commissions_affiliate_idx  ON affiliate_commissions (affiliate_id);
CREATE INDEX IF NOT EXISTS affiliate_commissions_account_idx    ON affiliate_commissions (account_id);
CREATE INDEX IF NOT EXISTS affiliate_commissions_status_idx     ON affiliate_commissions (status);
CREATE INDEX IF NOT EXISTS affiliate_commissions_accrued_at_idx ON affiliate_commissions (accrued_at);
CREATE INDEX IF NOT EXISTS affiliate_commissions_payable_at_idx ON affiliate_commissions (payable_at);

-- ── 4. Quarterly payouts ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id    uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  period_label    text NOT NULL,
  gross_usd       double precision NOT NULL DEFAULT 0,
  adjustments_usd double precision NOT NULL DEFAULT 0,
  net_usd         double precision NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'draft',
  paid_at         timestamptz,
  reference       text,
  notes           text,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS affiliate_payouts_affiliate_idx ON affiliate_payouts (affiliate_id);
CREATE INDEX IF NOT EXISTS affiliate_payouts_period_idx    ON affiliate_payouts (period_label);

-- ── 5. Rate-change audit ────────────────────────────────────────────────────
-- The affiliates table holds only the CURRENT rate. This answers "what was
-- this affiliate's rate on the day that invoice was paid?" years later, which
-- a single mutable column cannot.
CREATE TABLE IF NOT EXISTS affiliate_rate_changes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  from_pct     integer NOT NULL,
  to_pct       integer NOT NULL,
  reason       text NOT NULL,
  note         text,
  changed_by   text,
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS affiliate_rate_changes_affiliate_idx ON affiliate_rate_changes (affiliate_id);

-- ── Verification ────────────────────────────────────────────────────────────
-- Reads the catalog rather than trusting the statements above to have done
-- what they said. Expect: accounts.referral_code present, 4 affiliate tables,
-- and the unique index on affiliate_commissions.stripe_invoice_id.
SELECT 'accounts.referral_code' AS check_item,
       count(*)::text AS found, '1 expected' AS expected
  FROM information_schema.columns
 WHERE table_name = 'accounts' AND column_name = 'referral_code'
UNION ALL
SELECT 'affiliate tables', count(*)::text, '4 expected'
  FROM information_schema.tables
 WHERE table_name IN ('affiliates','affiliate_commissions','affiliate_payouts','affiliate_rate_changes')
UNION ALL
SELECT 'unique key on stripe_invoice_id', count(*)::text, '1 expected'
  FROM pg_indexes
 WHERE tablename = 'affiliate_commissions' AND indexdef ILIKE '%UNIQUE%stripe_invoice_id%';
