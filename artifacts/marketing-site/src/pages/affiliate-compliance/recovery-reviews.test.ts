import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { recoveryResolutionIsValid, type PaidCommissionRecoveryReview } from './types.ts';

test('resolution requires an explicit recovered or waived decision and a substantial written reason', () => {
  assert.equal(recoveryResolutionIsValid(null, 'Documented recovery'), false);
  assert.equal(recoveryResolutionIsValid('recovered', 'short'), false);
  assert.equal(recoveryResolutionIsValid('waived', '          '), false);
  assert.equal(recoveryResolutionIsValid('recovered', '  Bank transfer verified  '), true);
  assert.equal(recoveryResolutionIsValid('waived', '  Not economically recoverable  '), true);
});

test('review shape retains affiliate, invoice, refund, dispute and context', () => {
  const review: PaidCommissionRecoveryReview = {
    affiliateId: 'aff-27', affiliateName: 'Partner One', stripeInvoiceId: 'in_123',
    chargeAmountUsd: '87.35', refundedAmountUsd: '24.30', disputeStatus: 'under_review',
    recoveryReviewReason: 'Partial refund after paid commission',
    updatedAt: '2026-04-07T09:00:00Z', clientName: 'Cedar Clinic',
  };
  assert.equal(review.stripeInvoiceId, 'in_123');
  assert.equal(review.refundedAmountUsd, '24.30');
  assert.equal(review.recoveryReviewReason, 'Partial refund after paid commission');
});

test('authenticated review query and resolution invalidate the related payout and eligibility views', () => {
  const hooks = readFileSync(new URL('./hooks.ts', import.meta.url), 'utf8');
  const queue = readFileSync(new URL('./RecoveryReviewQueue.tsx', import.meta.url), 'utf8');
  const admin = readFileSync(new URL('./AdminPayouts.tsx', import.meta.url), 'utf8');
  assert.match(hooks, /fetchAuth\('\/admin\/payouts\/recovery-reviews'\)/);
  assert.match(hooks, /queryKey: \['admin-recovery-reviews', userId, sessionId\]/);
  assert.match(hooks, /encodeURIComponent\(invoiceId\)\}\/resolve/);
  assert.match(hooks, /JSON\.stringify\(\{ decision, reason: reason\.trim\(\) \}\)/);
  for (const prefix of ['admin-recovery-reviews', 'admin-affiliate', 'admin-payouts', 'admin-quarterly-preview', 'payout-statement', 'portal-payouts', 'affiliate-portal']) {
    assert.match(hooks, new RegExp(`invalidateQueries\\(\\{ queryKey: \\['${prefix}'`));
  }
  assert.match(queue, /useAdminAccountAccess\(true\)/);
  assert.match(queue, /access\.data\?\.isSuperAdmin === true/);
  assert.match(queue, /if \(!isSuperAdmin \|\| !recoveryResolutionIsValid/);
  assert.match(queue, /does not initiate a transfer/);
  assert.match(queue, /without recovering funds/);
  assert.match(admin, /<RecoveryReviewQueue \/>/);
});