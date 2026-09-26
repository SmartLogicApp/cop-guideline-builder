CREATE TABLE IF NOT EXISTS affiliate_qualifying_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  stripe_invoice_id text NOT NULL,
  paid_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_qualifying_referrals_pair_key UNIQUE (affiliate_id, account_id),
  CONSTRAINT affiliate_qualifying_referrals_invoice_key UNIQUE (stripe_invoice_id)
);

CREATE INDEX IF NOT EXISTS affiliate_qualifying_referrals_account_idx
  ON affiliate_qualifying_referrals (account_id);

-- Existing commission rows prove that the affiliate/customer pair was already
-- referred. Keep the earliest available invoice as the history key so existing
-- customers cannot be misclassified as first referrals after deployment.
INSERT INTO affiliate_qualifying_referrals (
  affiliate_id,
  account_id,
  stripe_invoice_id,
  paid_at
)
SELECT DISTINCT ON (affiliate_id, account_id)
  affiliate_id,
  account_id,
  stripe_invoice_id,
  accrued_at
FROM affiliate_commissions
WHERE stripe_invoice_id IS NOT NULL
ORDER BY affiliate_id, account_id, accrued_at, id
ON CONFLICT DO NOTHING;