CREATE TABLE IF NOT EXISTS affiliate_out_of_order_payment_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_invoice_id text NOT NULL,
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  paid_at timestamptz NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_out_of_order_payment_reviews_invoice_key UNIQUE (stripe_invoice_id)
);

CREATE INDEX IF NOT EXISTS affiliate_out_of_order_payment_reviews_created_idx
  ON affiliate_out_of_order_payment_reviews (created_at);