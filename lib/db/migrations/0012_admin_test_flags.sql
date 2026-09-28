-- Reversible operational flags; historical account and commission records stay intact.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

ALTER TABLE affiliates
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS accounts_is_test_idx ON accounts (is_test);
CREATE INDEX IF NOT EXISTS affiliates_is_test_idx ON affiliates (is_test);

CREATE TABLE IF NOT EXISTS admin_test_flag_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  actor_id text NOT NULL,
  prior_value boolean NOT NULL,
  new_value boolean NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_test_flag_audit_entity_type_check
    CHECK (entity_type IN ('account', 'affiliate')),
  CONSTRAINT admin_test_flag_audit_reason_check
    CHECK (char_length(btrim(reason)) >= 10)
);

CREATE INDEX IF NOT EXISTS admin_test_flag_audit_entity_idx
  ON admin_test_flag_audit (entity_type, entity_id, created_at DESC);