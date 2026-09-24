-- Additive development migration; Replit Publish applies the development
-- schema diff to managed production. Do not run application DDL on startup.
CREATE TABLE IF NOT EXISTS affiliate_agreements (
  version text PRIMARY KEY,
  body text NOT NULL,
  content_sha256 text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by text NOT NULL
);
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS agreement_identity_epoch integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS affiliate_agreement_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id),
  agreement_version text NOT NULL REFERENCES affiliate_agreements(version),
  token_sha256 text NOT NULL UNIQUE,
  recipient_email text NOT NULL,
  identity_epoch integer NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  consumed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_agreement_invitations ADD COLUMN IF NOT EXISTS identity_epoch integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS affiliate_agreement_invitations_affiliate_idx
  ON affiliate_agreement_invitations(affiliate_id);

CREATE TABLE IF NOT EXISTS affiliate_agreement_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliates(id),
  invitation_id uuid NOT NULL REFERENCES affiliate_agreement_invitations(id),
  agreement_version text NOT NULL REFERENCES affiliate_agreements(version),
  content_sha256 text NOT NULL,
  signer_name text NOT NULL,
  signer_email text NOT NULL,
  identity_epoch integer NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE affiliate_agreement_acceptances ADD COLUMN IF NOT EXISTS identity_epoch integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_agreement_acceptances_invitation_idx
  ON affiliate_agreement_acceptances(invitation_id);
CREATE INDEX IF NOT EXISTS affiliate_agreement_acceptances_affiliate_version_idx
  ON affiliate_agreement_acceptances(affiliate_id, agreement_version);
DROP INDEX IF EXISTS affiliate_agreement_acceptances_once_idx;
CREATE UNIQUE INDEX affiliate_agreement_acceptances_once_idx
  ON affiliate_agreement_acceptances(affiliate_id, agreement_version, identity_epoch);