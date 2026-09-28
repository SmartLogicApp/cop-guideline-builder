import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { billingMonthUTC, payoutStatusLabel, type PayoutStatement } from './types.ts';

test('billing months are displayed in UTC even at a timezone boundary', () => {
  assert.equal(billingMonthUTC('2026-02'), 'February 2026');
  assert.equal(billingMonthUTC('2026-02-01T00:00:00.000Z'), 'February 2026');
  assert.equal(billingMonthUTC('2026-03-01T01:00:00+02:00'), 'February 2026');
});

test('paid, held and reversal statuses retain their exact distinctions', () => {
  assert.equal(payoutStatusLabel('paid'), 'Paid');
  assert.equal(payoutStatusLabel('payable_pending_admin_approval'), 'Payable Pending Admin Approval');
  assert.equal(payoutStatusLabel('reversal_review_required'), 'Reversal review required');
  assert.equal(payoutStatusLabel('held'), 'Held');
  assert.equal(payoutStatusLabel('reversed'), 'Reversed');
});

test('statement contract preserves line amounts and separate adjustment/net totals', () => {
  const statement: PayoutStatement = {
    payout: {
      id: 'pay-1', affiliateId: 'aff-1', payoutPeriodStart: '2026-01-01',
      payoutPeriodEnd: '2026-03-31', payoutStatus: 'paid', currency: 'USD',
      grossCommissionAmount: '28.75', adjustmentsAmount: '-3.50',
      netPayoutAmount: '25.25', createdAt: '2026-04-01T00:00:00Z', paidAt: '2026-04-04T00:00:00Z',
    },
    lines: [{ clientName: 'Cedar Clinic', billingMonth: '2026-02', clientPaymentUsd: '115.00', commissionRatePct: '25', commissionAmountUsd: '28.75', commissionStatus: 'payable' }],
    totalClientPaymentUsd: '115.00', totalCommissionUsd: '28.75', adjustmentsAmount: '-3.50', netPayoutAmount: '25.25',
  };
  assert.equal(statement.lines[0].clientName, 'Cedar Clinic');
  assert.equal(statement.lines[0].commissionRatePct, '25');
  assert.equal(Number(statement.totalCommissionUsd) + Number(statement.adjustmentsAmount), Number(statement.netPayoutAmount));
});

test('both statement scopes request authenticated CSV blobs rather than direct links', () => {
  const hooks = readFileSync(new URL('./hooks.ts', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('./PayoutStatement.tsx', import.meta.url), 'utf8');
  const admin = readFileSync(new URL('./AdminPayouts.tsx', import.meta.url), 'utf8');
  const portal = readFileSync(new URL('./AffiliatePortalPage.tsx', import.meta.url), 'utf8');
  assert.match(hooks, /fetchAuth\('\/portal\/payouts'\)/);
  assert.match(hooks, /queryKey: \['payout-statement', scope, userId, sessionId, id\]/);
  assert.match(hooks, /statement\?format=csv/);
  assert.match(hooks, /Authorization: `Bearer \$\{token\}`/);
  assert.match(hooks, /response\.blob\(\)/);
  assert.match(hooks, /invalidateQueries\(\{ queryKey: \['payout-statement', 'admin'\] \}\)/);
  assert.match(panel, /data\.lines\.map/);
  assert.match(panel, /data\.adjustmentsAmount/);
  assert.match(admin, /<PayoutStatement scope="admin"/);
  assert.match(portal, /<PayoutStatement scope="portal"/);
});