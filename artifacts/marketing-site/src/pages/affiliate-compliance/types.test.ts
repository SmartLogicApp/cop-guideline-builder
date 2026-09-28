import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAcknowledgementPayload, orderPayoutChecklist, payoutChecklistNeedsRegion, payoutChecklistProgress, type PayoutChecklistItem } from './types';

const checklist: PayoutChecklistItem[] = [
  { key: 'admin', title: 'Admin approval', complete: true, status: 'Complete', version: null, completedAt: null, action: null },
  { key: 'marketing', title: 'Marketing guidelines', complete: true, status: 'Complete', version: '2', completedAt: '2026-01-01T00:00:00Z', action: null },
  { key: 'ftc', title: 'FTC disclosure', complete: true, status: 'Complete', version: '3', completedAt: '2026-01-01T00:00:00Z', action: null },
  { key: 'payment', title: 'Payment setup', complete: true, status: 'Complete', version: 'complete', completedAt: null, action: null },
  { key: 'tax', title: 'Tax information', complete: true, status: 'Complete', version: 'verified_complete', completedAt: null, action: null },
  { key: 'privacy', title: 'Privacy notice', complete: true, status: 'Complete', version: '1', completedAt: '2026-01-01T00:00:00Z', action: null },
  { key: 'agreement', title: 'Partner agreement', complete: true, status: 'Complete', version: '2026-01', completedAt: '2026-01-01T00:00:00Z', action: null },
];

test('orders the server checklist in the same seven-step sequence', () => {
  assert.deepEqual(orderPayoutChecklist(checklist).map((item) => item.key), [
    'agreement', 'privacy', 'ftc', 'marketing', 'tax', 'payment', 'admin',
  ]);
});

test('shows eligibility only when all seven items and payout eligibility are complete', () => {
  assert.equal(payoutChecklistProgress(checklist, true).heading, 'Eligible for commission payouts');
  assert.equal(payoutChecklistProgress(checklist, false).heading, '0 of 7 steps left');
});

test('counts incomplete and missing items as steps left', () => {
  const partial = checklist.filter((item) => item.key !== 'admin')
    .map((item) => item.key === 'tax' ? { ...item, complete: false, status: 'Action needed' as const } : item);
  const progress = payoutChecklistProgress(partial, true);
  assert.equal(progress.completed, 5);
  assert.equal(progress.remaining, 2);
  assert.equal(progress.heading, '2 of 7 steps left');
  assert.equal(progress.eligible, false);
});

test('does not report a green step when complete and status disagree', () => {
  const inconsistent = checklist.map((item) => item.key === 'tax' ? { ...item, complete: false } : item);
  assert.equal(payoutChecklistProgress(inconsistent, true).heading, '1 of 7 steps left');
});

test('shows region setup from the server-provided set_region action', () => {
  const withRegionAction = checklist.map((item) => item.key === 'tax'
    ? { ...item, complete: false, status: 'Action needed' as const, action: { type: 'set_region' as const, label: 'Add country and state' } }
    : item);
  assert.equal(payoutChecklistNeedsRegion(withRegionAction), true);
  assert.equal(payoutChecklistNeedsRegion(checklist), false);
});

test('includes the backend-required reviewed-document confirmation in acknowledgement requests', () => {
  assert.deepEqual(buildAcknowledgementPayload({
    documentVersionId: 'doc-current',
    typedLegalName: 'Affiliate Name',
    agreed: true,
  }), {
    documentVersionId: 'doc-current',
    typedLegalName: 'Affiliate Name',
    agreed: true,
    confirmedReviewed: true,
  });
});