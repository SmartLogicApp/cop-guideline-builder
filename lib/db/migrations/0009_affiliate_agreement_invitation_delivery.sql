-- Additive migration. Existing invitations have unknown transport outcomes.
ALTER TABLE affiliate_agreement_invitations
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS delivery_failure_category text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS delivery_transport text,
  ADD COLUMN IF NOT EXISTS delivery_http_status integer;