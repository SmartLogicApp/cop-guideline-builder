-- Exact, immutable membership between test-mode payout workflows and ledger
-- commissions. Released/reversed claims remain as audit history; only claimed
-- or paid rows reserve a commission from another payout.
CREATE TABLE IF NOT EXISTS affiliate_payout_workflow_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_workflow_id uuid NOT NULL REFERENCES affiliate_payout_workflow(id) ON DELETE RESTRICT,
  commission_id uuid NOT NULL REFERENCES affiliate_commissions(id) ON DELETE RESTRICT,
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  commission_amount numeric(14, 2) NOT NULL CHECK (commission_amount > 0),
  status text NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed', 'paid', 'released', 'reversed')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_payout_workflow_commission_pair_uidx UNIQUE (payout_workflow_id, commission_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_payout_workflow_commission_active_uidx
  ON affiliate_payout_workflow_commissions(commission_id)
  WHERE status IN ('claimed', 'paid');
CREATE INDEX IF NOT EXISTS affiliate_payout_workflow_commissions_workflow_idx
  ON affiliate_payout_workflow_commissions(payout_workflow_id);
CREATE INDEX IF NOT EXISTS affiliate_payout_workflow_commissions_affiliate_idx
  ON affiliate_payout_workflow_commissions(affiliate_id);

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_payout_workflow_transfer_uidx
  ON affiliate_payout_workflow(stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;

ALTER TABLE affiliate_payout_workflow
  DROP CONSTRAINT IF EXISTS affiliate_payout_workflow_status_check;
ALTER TABLE affiliate_payout_workflow
  ADD CONSTRAINT affiliate_payout_workflow_status_check
  CHECK (payout_status IN (
    'accrued', 'pending_hold_period', 'payable_pending_compliance',
    'payable_pending_admin_approval', 'approved_for_payout', 'payout_processing',
    'paid', 'failed', 'reversed', 'reversal_review_required', 'withheld', 'voided'
  ));