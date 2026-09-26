-- Preserve the applicant's business name as it appeared at each agreement
-- acceptance. Existing rows remain NULL because company_name is mutable and
-- historical signing-time values cannot be inferred safely.
ALTER TABLE affiliate_agreement_acceptances
  ADD COLUMN IF NOT EXISTS legal_business_name text;