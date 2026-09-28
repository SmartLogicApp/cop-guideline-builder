import { useState } from 'react';
import { AdminShell } from './shells';
import { 
  useAdminPayouts, 
  useAdminAffiliates,
  useAdminQuarterlyPreview,
  useAdminQuarterlyRun,
  useAdminPayoutDraft,
  useAdminPayoutApprove,
  useAdminPayoutSend,
  useAdminPayoutVoid,
  useAdminAccountAccess,
} from './hooks';
import { CheckCircle2, AlertCircle, Plus, ShieldAlert, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { PayoutStatement, PayoutStatus } from './PayoutStatement';
import type { PayoutSummary } from './types';
import { RecoveryReviewQueue } from './RecoveryReviewQueue';

function lastCompletedQuarter(): string {
  const previous = new Date();
  previous.setDate(1);
  previous.setMonth(previous.getMonth() - 3);
  return `${previous.getFullYear()}-Q${Math.floor(previous.getMonth() / 3) + 1}`;
}

export default function AdminPayouts() {
  const [includeTest, setIncludeTest] = useState(false);
  const adminAccess = useAdminAccountAccess(true);
  const isSuperAdmin = !adminAccess.isLoading && !adminAccess.isFetching
    && !adminAccess.isError && adminAccess.data?.isSuperAdmin === true;
  const { data: payouts, isLoading: isLoadingPayouts, error: payoutsError, refetch: retryPayouts } = useAdminPayouts(includeTest && isSuperAdmin);
  const { data: affiliates, isLoading: isLoadingAffiliates } = useAdminAffiliates();
  const { toast } = useToast();

  const draft = useAdminPayoutDraft();
  const [quarter, setQuarter] = useState(lastCompletedQuarter);
  const [quarterConfirmed, setQuarterConfirmed] = useState(false);
  const [quarterResult, setQuarterResult] = useState<any>(null);
  const quarterlyPreview = useAdminQuarterlyPreview(quarter);
  const quarterlyRun = useAdminQuarterlyRun();
  
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftForm, setDraftForm] = useState({ affiliateId: '', payoutPeriodStart: '', payoutPeriodEnd: '' });

  const handleDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await draft.mutateAsync(draftForm);
      toast({ title: 'Draft created', description: 'Payout draft has been created successfully.' });
      setDraftOpen(false);
      setDraftForm({ affiliateId: '', payoutPeriodStart: '', payoutPeriodEnd: '' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  const handleQuarterRun = async () => {
    try {
      const result = await quarterlyRun.mutateAsync(quarter);
      setQuarterResult(result);
      setQuarterConfirmed(false);
      toast({ title: 'Quarter preparation finished', description: `${result.drafted} drafts created; ${result.held} held; ${result.errors} need review.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Quarter could not be prepared', description: err.message });
    }
  };

  if (isLoadingPayouts || isLoadingAffiliates) {
    return <AdminShell title="Affiliate Payouts"><div role="status" className="space-y-3 p-8 animate-pulse"><div className="h-12 rounded bg-slate-100" /><div className="h-20 rounded bg-slate-100" /><div className="h-20 rounded bg-slate-100" /><span className="sr-only">Loading payouts</span></div></AdminShell>;
  }

  return (
    <AdminShell title="Affiliate Payouts" subtitle="Manage and process commission payouts">
      <RecoveryReviewQueue />
      <div className="mb-6 flex justify-between items-center">
        <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-4 py-2 text-sm flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 flex-shrink-0" />
          <span><strong>Stripe Test Mode Only:</strong> All payouts are currently in test mode.</span>
        </div>
        <Button onClick={() => setDraftOpen(true)} className="bg-slate-900 text-white hover:bg-slate-800">
          <Plus className="w-4 h-4 mr-2" /> Draft New Payout
        </Button>
      </div>
      <section className="mb-6 rounded-lg border bg-white p-4" aria-label="Test payout visibility">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <input type="checkbox" checked={includeTest && isSuperAdmin} disabled={!isSuperAdmin}
            onChange={(event) => setIncludeTest(event.target.checked)}
            className="rounded border-slate-300" data-testid="toggle-show-test-payouts" />
          Show test payouts
        </label>
        {!isSuperAdmin && <p className="mt-2 text-sm text-slate-600">Test payout review is available only to a verified Super Admin.</p>}
        {includeTest && isSuperAdmin && <p className="mt-2 text-sm text-amber-900" role="note">
          Review mode only: test payouts may appear below with a Test badge. Test records remain excluded from normal admin counts and payout selection.
        </p>}
      </section>

      <section className="bg-white border rounded-xl shadow-sm p-6 mb-6 space-y-4" aria-label="Quarterly payout preparation">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Prepare a quarterly payout run</h2>
          <p className="text-sm text-slate-600 mt-1">Only a completed quarter can be prepared. This creates reviewed drafts for eligible affiliates; it does not send money. Approve and send each draft separately below. Ineligible affiliates stay on hold with a reason.</p>
        </div>
        <label className="block text-sm font-medium text-slate-700 max-w-48">Quarter (YYYY-Q1…Q4)
          <input type="text" value={quarter} onChange={e => {
            setQuarter(e.target.value.toUpperCase()); setQuarterResult(null); setQuarterConfirmed(false);
          }} placeholder="2026-Q1" className="mt-1 block w-full rounded-md border px-3 py-2" />
        </label>
        {quarterlyPreview.isLoading && <p className="text-sm text-slate-500">Checking commissions and eligibility…</p>}
        {quarterlyPreview.error && <p role="alert" className="text-sm text-red-700">{(quarterlyPreview.error as Error).message}</p>}
        {quarterlyPreview.data && <div className="overflow-x-auto">
          <p className="font-semibold text-sm text-slate-900 mb-2">Preview for {quarterlyPreview.data.quarter} — eligibility is checked again when you prepare each draft.</p>
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b bg-slate-50">
              <th className="p-2">Affiliate</th><th className="p-2">Available commissions</th><th className="p-2">Amount</th><th className="p-2">Decision / reason</th>
            </tr></thead>
            <tbody>{quarterlyPreview.data.rows.map((row: any) => <tr key={row.affiliateId} className="border-b align-top">
              <td className="p-2 font-medium">{row.affiliateName}</td>
              <td className="p-2">{row.commissionCount}</td>
              <td className="p-2">${row.amountUsd}</td>
              <td className="p-2">{row.eligible ? <span className="text-emerald-700">Ready to draft</span>
                : <ul className="text-amber-800 list-disc pl-4">{row.blocking_reasons.map((reason: string, i: number) => <li key={i}>{reason}</li>)}</ul>}</td>
            </tr>)}</tbody>
          </table>
          {quarterlyPreview.data.rows.length === 0 && <p className="p-3 text-slate-600 text-sm">No due commissions or existing payouts for this quarter.</p>}
        </div>}
        <label className="flex gap-2 items-start text-sm text-slate-800">
          <input type="checkbox" className="mt-1" checked={quarterConfirmed} onChange={e => setQuarterConfirmed(e.target.checked)} />
          I confirm I want to prepare payout drafts for this completed quarter. No Stripe transfers will be sent by this action.
        </label>
        <Button onClick={handleQuarterRun} disabled={!quarterConfirmed || !quarterlyPreview.data || quarterlyRun.isPending || quarterlyPreview.isFetching || quarterlyPreview.data.rows.length === 0}
          className="bg-slate-900 text-white hover:bg-slate-800">
          {quarterlyRun.isPending ? 'Preparing…' : 'Prepare eligible drafts'}
        </Button>
        {quarterResult && <div role="status" className="rounded-lg border bg-slate-50 p-4 text-sm">
          <strong>Run result for {quarterResult.quarter}: {quarterResult.drafted} drafted, {quarterResult.held} held, {quarterResult.errors} need review.</strong>
          <ul className="mt-2 space-y-2">{quarterResult.rows.map((row: any) => <li key={row.affiliateId}>
            <span className="font-medium">{row.affiliateName}</span> — {row.status === 'drafted' ? 'Draft ready for approval' : row.status === 'held' ? 'Held' : 'Result uncertain'}
            {row.blocking_reasons.length > 0 && <span className="text-amber-800">: {row.blocking_reasons.join('; ')}</span>}
          </li>)}</ul>
        </div>}
      </section>

      {draftOpen && (
        <form onSubmit={handleDraft} className="bg-white border rounded-xl shadow-sm p-6 mb-6">
          <h3 className="font-bold text-lg mb-4 text-slate-900">Draft Payout</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <label className="block text-sm font-medium text-slate-700">
              Affiliate
              <select
                required
                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-slate-800 focus:ring-slate-800 sm:text-sm px-3 py-2 border bg-white"
                value={draftForm.affiliateId}
                onChange={e => setDraftForm({ ...draftForm, affiliateId: e.target.value })}
              >
                <option value="">Select an affiliate...</option>
                {affiliates?.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.legalName || a.businessName || a.email}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Period Start
              <input
                type="date"
                required
                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-slate-800 focus:ring-slate-800 sm:text-sm px-3 py-2 border bg-white"
                value={draftForm.payoutPeriodStart}
                onChange={e => setDraftForm({ ...draftForm, payoutPeriodStart: e.target.value })}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Period End
              <input
                type="date"
                required
                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-slate-800 focus:ring-slate-800 sm:text-sm px-3 py-2 border bg-white"
                value={draftForm.payoutPeriodEnd}
                onChange={e => setDraftForm({ ...draftForm, payoutPeriodEnd: e.target.value })}
              />
            </label>
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setDraftOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={draft.isPending} className="bg-slate-900 text-white hover:bg-slate-800">
              {draft.isPending ? 'Drafting...' : 'Create Draft'}
            </Button>
          </div>
        </form>
      )}

      {payoutsError && <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Could not load payouts: {payoutsError.message} <Button type="button" size="sm" variant="outline" className="ml-3" onClick={() => void retryPayouts()}>Retry</Button>
      </div>}
      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-900 border-b">
            <tr>
              <th className="px-4 py-3 font-semibold">Payout ID</th>
              <th className="px-4 py-3 font-semibold">Affiliate</th>
              <th className="px-4 py-3 font-semibold">Amount</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Eligibility</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payouts?.map((payout: PayoutSummary) => {
              const affiliate = affiliates?.find((a: any) => a.id === payout.affiliateId);
              return (
                <PayoutRow key={payout.id} payout={payout} affiliate={affiliate} />
              );
            })}
            {!payoutsError && (!payouts || payouts.length === 0) && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No payouts found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}

function PayoutRow({ payout, affiliate }: { payout: PayoutSummary, affiliate: any }) {
  const [action, setAction] = useState<'approve' | 'send' | 'void' | null>(null);
  const [statementOpen, setStatementOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  
  const approve = useAdminPayoutApprove(payout.id);
  const send = useAdminPayoutSend(payout.id);
  const voidPayout = useAdminPayoutVoid(payout.id);
  
  const { toast } = useToast();

  const affiliateName = affiliate?.legalName || affiliate?.businessName || affiliate?.email || 'Unknown';
  const isTestPayout = payout.testLinked === true || affiliate?.isTest === true;
  
  const isPending = approve.isPending || send.isPending || voidPayout.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (action === 'approve') {
        await approve.mutateAsync({ reason });
        toast({ title: 'Approved', description: 'Payout approved successfully.' });
      } else if (action === 'send') {
        await send.mutateAsync({ reason, confirmed });
        toast({ title: 'Sent', description: 'Payout sent to Stripe processing.' });
      } else if (action === 'void') {
        await voidPayout.mutateAsync({ reason });
        toast({ title: 'Voided', description: 'Payout voided successfully.' });
      }
      setAction(null);
      setReason('');
      setConfirmed(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Action Failed', description: err.message });
    }
  };

  const getMaskedStripeId = () => {
    const acct = affiliate?.compliance?.stripeConnectedAccountId;
    if (!acct) return 'None';
    return `...${acct.slice(-4)}`;
  };

  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors">
        <td className="px-4 py-4 font-mono text-xs">{payout.id.substring(0, 8)}...</td>
        <td className="px-4 py-4">
          <div className="font-semibold text-slate-900">{affiliateName}</div>
          {isTestPayout && <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900" data-testid={`badge-test-payout-${payout.id}`}>Test</span>}
          <div className="text-xs text-slate-500">{new Date(payout.payoutPeriodStart).toLocaleDateString()} - {new Date(payout.payoutPeriodEnd).toLocaleDateString()}</div>
        </td>
        <td className="px-4 py-4 font-semibold text-slate-900">${(Number(payout.netPayoutAmount)).toFixed(2)}</td>
        <td className="min-w-[180px] whitespace-normal px-4 py-4">
          <PayoutStatus status={payout.payoutStatus} />
          {payout.failureReason && <p className="mt-2 max-w-52 text-xs text-amber-800">{payout.failureReason}</p>}
        </td>
        <td className="px-4 py-4">
          {payout.eligibility?.eligible ? (
            <span className="text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Eligible</span>
          ) : (
            <div className="text-red-600 flex flex-col gap-1">
              <div className="flex items-center gap-1"><AlertCircle className="w-4 h-4 flex-shrink-0" /> Blocked</div>
              {payout.eligibility?.blocking_reasons?.map((br: string, idx: number) => (
                <span key={idx} className="text-xs leading-tight" title={br}>• {br}</span>
              ))}
            </div>
          )}
        </td>
        <td className="px-4 py-4 text-right space-x-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setStatementOpen(value => !value)}
            aria-expanded={statementOpen} aria-controls={`statement-panel-${payout.id}`} data-testid={`button-toggle-statement-${payout.id}`}>
            {statementOpen ? 'Hide statement' : 'View statement'}
          </Button>
          {payout.payoutStatus === 'payable_pending_admin_approval' && (
            <>
              <Button size="sm" variant="outline" disabled={isTestPayout || !payout.eligibility?.eligible} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => setAction('approve')}>Approve</Button>
              <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => setAction('void')}>Void</Button>
            </>
          )}
          {payout.payoutStatus === 'approved_for_payout' && (
            <>
              <Button size="sm" variant="outline" disabled={isTestPayout || !payout.eligibility?.eligible} className="border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => setAction('send')}>Send</Button>
              <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => setAction('void')}>Void</Button>
            </>
          )}
          {isTestPayout && <span className="mt-2 block text-xs font-medium text-amber-900">Test payouts cannot be approved or sent.</span>}
        </td>
      </tr>

      {statementOpen && <tr><td colSpan={6} id={`statement-panel-${payout.id}`} className="p-3 sm:p-5 bg-slate-50">
        <PayoutStatement scope="admin" id={payout.id} />
      </td></tr>}

      {action && (
        <tr>
          <td colSpan={6} className="p-0 border-b">
            <div className="bg-slate-50 p-6 border-b border-t border-slate-200 shadow-inner">
              <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-4">
                <h4 className="font-bold text-lg text-slate-900 capitalize">{action} Payout</h4>
                
                {action === 'send' && (
                  <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-3 mb-4 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div><span className="text-slate-500 block">Affiliate Name</span> <strong className="text-slate-900">{affiliateName}</strong></div>
                      <div><span className="text-slate-500 block">Affiliate ID</span> <strong className="text-slate-900 font-mono text-xs">{payout.affiliateId}</strong></div>
                      <div><span className="text-slate-500 block">Payout Period</span> <strong className="text-slate-900">{new Date(payout.payoutPeriodStart).toLocaleDateString()} - {new Date(payout.payoutPeriodEnd).toLocaleDateString()}</strong></div>
                      <div><span className="text-slate-500 block">Commission Amount</span> <strong className="text-slate-900 text-lg text-emerald-700">${(Number(payout.netPayoutAmount)).toFixed(2)}</strong></div>
                      <div className="col-span-2 border-t pt-2 mt-1">
                        <span className="text-slate-500 block">Stripe Account</span> <strong className="text-slate-900 font-mono tracking-wider">{getMaskedStripeId()}</strong>
                      </div>
                    </div>
                    
                    <div className="border-t pt-3 mt-3">
                       <div className="flex items-center gap-2 text-slate-700 font-medium">
                         <Check className="w-4 h-4" /> Current eligibility is checked again on the server immediately before transfer.
                      </div>
                    </div>
                  </div>
                )}
                
                <label className="block text-sm font-medium text-slate-700">
                  {action === 'send' ? 'Confirm authorization reason / note (required)' : 'Reason (required)'}
                  <textarea
                    required
                    rows={2}
                    className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-slate-800 focus:ring-slate-800 sm:text-sm px-3 py-2 border bg-white"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                  />
                </label>

                {action === 'send' && (
                  <label className="flex items-start gap-3 mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                    <input
                      type="checkbox"
                      required
                      checked={confirmed}
                      onChange={e => setConfirmed(e.target.checked)}
                      className="mt-1 border-slate-300 text-blue-800 focus:ring-blue-700 rounded"
                    />
                    <span className="text-sm text-blue-900 font-medium leading-relaxed">
                      I confirm that this payout is authorized, the compliance checks are complete, and the funds should be transferred via Stripe.
                    </span>
                  </label>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="ghost" onClick={() => { setAction(null); setReason(''); setConfirmed(false); }}>Cancel</Button>
                  <Button type="submit" disabled={isPending} className="bg-slate-900 text-white hover:bg-slate-800 capitalize">
                    {isPending ? 'Processing...' : `Confirm ${action}`}
                  </Button>
                </div>
              </form>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
