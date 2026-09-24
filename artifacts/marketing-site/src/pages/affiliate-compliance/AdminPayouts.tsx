import { useState } from 'react';
import { AdminShell } from './shells';
import { 
  useAdminPayouts, 
  useAdminAffiliates,
  useAdminPayoutDraft,
  useAdminPayoutApprove,
  useAdminPayoutSend,
  useAdminPayoutVoid
} from './hooks';
import { Loader2, CheckCircle2, AlertCircle, Plus, ShieldAlert, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function AdminPayouts() {
  const { data: payouts, isLoading: isLoadingPayouts } = useAdminPayouts();
  const { data: affiliates, isLoading: isLoadingAffiliates } = useAdminAffiliates();
  const { toast } = useToast();

  const draft = useAdminPayoutDraft();
  
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

  if (isLoadingPayouts || isLoadingAffiliates) {
    return <AdminShell title="Affiliate Payouts"><div className="flex justify-center p-12"><Loader2 className="animate-spin text-slate-800" /></div></AdminShell>;
  }

  return (
    <AdminShell title="Affiliate Payouts" subtitle="Manage and process commission payouts">
      <div className="mb-6 flex justify-between items-center">
        <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-4 py-2 text-sm flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 flex-shrink-0" />
          <span><strong>Stripe Test Mode Only:</strong> All payouts are currently in test mode.</span>
        </div>
        <Button onClick={() => setDraftOpen(true)} className="bg-slate-900 text-white hover:bg-slate-800">
          <Plus className="w-4 h-4 mr-2" /> Draft New Payout
        </Button>
      </div>

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

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
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
            {payouts?.map((payout: any) => {
              const affiliate = affiliates?.find((a: any) => a.id === payout.affiliateId);
              return (
                <PayoutRow key={payout.id} payout={payout} affiliate={affiliate} />
              );
            })}
            {(!payouts || payouts.length === 0) && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No payouts found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}

function PayoutRow({ payout, affiliate }: { payout: any, affiliate: any }) {
  const [action, setAction] = useState<'approve' | 'send' | 'void' | null>(null);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  
  const approve = useAdminPayoutApprove(payout.id);
  const send = useAdminPayoutSend(payout.id);
  const voidPayout = useAdminPayoutVoid(payout.id);
  
  const { toast } = useToast();

  const affiliateName = affiliate?.legalName || affiliate?.businessName || affiliate?.email || 'Unknown';
  
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
          <div className="text-xs text-slate-500">{new Date(payout.payoutPeriodStart).toLocaleDateString()} - {new Date(payout.payoutPeriodEnd).toLocaleDateString()}</div>
        </td>
        <td className="px-4 py-4 font-semibold text-slate-900">${(Number(payout.netPayoutAmount)).toFixed(2)}</td>
        <td className="px-4 py-4">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium 
            ${payout.payoutStatus === 'paid' ? 'bg-emerald-100 text-emerald-800' : 
              payout.payoutStatus === 'voided' || payout.payoutStatus === 'failed' ? 'bg-red-100 text-red-800' : 
              payout.payoutStatus === 'reversal_review_required' ? 'bg-amber-100 text-amber-900' :
              'bg-blue-100 text-blue-800'}`}>
            {payout.payoutStatus.replace(/_/g, ' ')}
          </span>
        </td>
        <td className="px-4 py-4">
          {payout.eligibility?.eligible ? (
            <span className="text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Eligible</span>
          ) : (
            <div className="text-red-600 flex flex-col gap-1">
              <div className="flex items-center gap-1"><AlertCircle className="w-4 h-4 flex-shrink-0" /> Blocked</div>
              {payout.eligibility?.blocking_reasons?.map((br: string, idx: number) => (
                <span key={idx} className="text-[10px] leading-tight opacity-80" title={br}>• {br.length > 30 ? br.substring(0,30) + '...' : br}</span>
              ))}
            </div>
          )}
        </td>
        <td className="px-4 py-4 text-right space-x-2">
          {payout.payoutStatus === 'payable_pending_admin_approval' && (
            <>
              <Button size="sm" variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => setAction('approve')}>Approve</Button>
              <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => setAction('void')}>Void</Button>
            </>
          )}
          {payout.payoutStatus === 'approved_for_payout' && (
            <>
              <Button size="sm" variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => setAction('send')}>Send</Button>
              <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => setAction('void')}>Void</Button>
            </>
          )}
        </td>
      </tr>

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
                      <div className="flex items-center gap-2 text-emerald-700 font-medium">
                        <Check className="w-4 h-4" /> All compliance checks marked complete
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
