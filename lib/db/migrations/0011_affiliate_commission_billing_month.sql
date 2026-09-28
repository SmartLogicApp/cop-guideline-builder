-- Keep invoice-period provenance alongside the immutable commission accrual.
-- Existing records remain NULL because their original invoice period is not
-- reliably available locally; statement readers label their fallback as an
-- estimated payment month rather than inventing historical billing periods.
ALTER TABLE affiliate_commissions
  ADD COLUMN IF NOT EXISTS billing_month text;

ALTER TABLE affiliate_commissions
  ADD COLUMN IF NOT EXISTS billing_month_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'affiliate_commissions_billing_month_check'
  ) THEN
    ALTER TABLE affiliate_commissions
      ADD CONSTRAINT affiliate_commissions_billing_month_check
      CHECK (
        (billing_month IS NULL AND billing_month_source IS NULL)
        OR (
          billing_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
          AND billing_month_source IN (
            'invoice_line_period',
            'invoice_period',
            'payment_month_fallback'
          )
        )
      );
  END IF;
END $$;