CREATE TABLE IF NOT EXISTS affiliate_rate_notice_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  notice_type text NOT NULL CHECK (
    notice_type IN ('activity-period', 'grace-period', 'zero-restoration-window')
  ),
  deadline_at timestamptz NOT NULL,
  current_rate_pct integer NOT NULL CHECK (current_rate_pct IN (0, 10, 20)),
  next_rate_pct integer CHECK (next_rate_pct IN (0, 10, 20)),
  recipient_email text NOT NULL,
  claimed_at timestamptz,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_rate_notice_deliveries_key
    UNIQUE (affiliate_id, notice_type, deadline_at)
);

CREATE INDEX IF NOT EXISTS affiliate_rate_notice_deliveries_due_idx
  ON affiliate_rate_notice_deliveries (sent_at, claimed_at);