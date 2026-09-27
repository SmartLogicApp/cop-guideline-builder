import { useState } from 'react';
import { AdminShell } from './shells';
import { useAdminAffiliateDetail, useAdminAction, useAdminApplicationDecision, useAdminRecheck, useAdminRemind } from './hooks';
import { useParams, Link } from 'wouter';
import { Loader2, ArrowLeft, CheckCircle2, XCircle, AlertCircle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function AdminAffiliateDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: affiliate, isLoading, error } = useAdminAffiliateDetail(id || '');
  const [reason, setReason] = useState('');
  const [commissionRatePct, setCommissionRatePct] = useState(20);
  const [decisionReason, setDecisionReason] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const action = useAdminAction(id || '');
  const decision = useAdminApplicationDecision(id || '');
  const recheck = useAdminRecheck(id || '');
  const remind = useAdminRemind(id || '');
  const { toast } = useToast();

  if (isLoading) return <AdminShell title="Affiliate Details"><div className="flex justify-center p-12"><Loader2 className="animate-spin text-slate-800" /></div></AdminShell>;
  
  if (error || !affiliate) return (
    <AdminShell title="Affiliate Details">
      <div className="bg-red-50 text-red-800 p-6 rounded-xl border border-red-200">
        Error loading affiliate.
      </div>
    </AdminShell>
  );

  const handleAction = async (actionType: string) => {
    if (reason.trim().length < 5) {
      toast({ variant: "destructive", title: "Error", description: "Enter a review reason of at least 5 characters." });
      return;
    }
    try {
      await action.mutateAsync({ action: actionType, reason });
      toast({ title: "Action completed", description: `Affiliate successfully updated.` });
      setReason('');
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const decideApplication = async (type: 'approve' | 'reject' | 'hold' | 'release-hold') => {
    if (type === 'reject' && decisionReason.trim().length < 5) {
      toast({ variant: 'destructive', title: 'Error', description: 'Enter a review reason of at least 5 characters.' });
      return;
    }
    if (type === 'hold' && holdReason.trim().length < 5) {
      toast({ variant: 'destructive', title: 'Error', description: 'Enter a hold reason of at least 5 characters.' });
      return;
    }
    try {
      const result = await decision.mutateAsync(type === 'approve'
        ? { action: 'approve', commissionRatePct }
        : type === 'release-hold' ? { action: 'release-hold' }
          : { action: type, reason: type === 'hold' ? holdReason.trim() : decisionReason.trim() });
      if (result.status !== (type === 'approve' ? 'active' : type === 'reject' ? 'rejected' : 'pending')
        || (type === 'hold' && !result.applicationHeldAt)
        || (type === 'release-hold' && result.applicationHeldAt)) {
        throw new Error('The application status could not be confirmed. Refresh this page.');
      }
      toast({ title: type === 'approve' ? 'Application approved' : type === 'reject' ? 'Application disapproved' : type === 'hold' ? 'Application held' : 'Hold released',
        description: type === 'approve' ? `Affiliate activated. Referral code: ${result.referralCode}.${result.emailSent === false ? ' Approval email was not sent.' : ''}` : `Affiliate status is ${result.status}.` });
      setDecisionReason('');
      setHoldReason('');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  const StatusIcon = ({ ok }: { ok: boolean }) => ok ? <CheckCircle2 className="w-5 h-5 text-emerald-600 inline mr-2" /> : <XCircle className="w-5 h-5 text-red-500 inline mr-2" />;

  return (
    <AdminShell title={`Affiliate: ${affiliate.legalName || affiliate.businessName || affiliate.email}`} subtitle="Review compliance status and manage payouts">
      <div className="mb-6">
        <Link href="/admin/affiliates" className="text-sm font-medium text-slate-600 hover:text-slate-900 inline-flex items-center">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to list
        </Link>
        <p className="mt-3 text-sm font-semibold text-slate-800" data-testid="status-affiliate">
          Affiliate status: {affiliate.affiliate?.status ?? 'Unavailable'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-slate-900">Compliance Checklist</h2>
              <Button variant="outline" size="sm" onClick={() => recheck.mutate()} disabled={recheck.isPending}>
                {recheck.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Re-check Eligibility
              </Button>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between py-3 border-b">
                <span className="font-medium text-slate-700">1. Partner Agreement</span>
                <span className="text-slate-900"><StatusIcon ok={affiliate.complianceStatus?.agreement === 'Complete'} /> {affiliate.complianceStatus?.agreement || 'Missing'}</span>
              </div>
              <div className="flex justify-between py-3 border-b">
                <span className="font-medium text-slate-700">2. Privacy Notice</span>
                <span className="text-slate-900"><StatusIcon ok={affiliate.complianceStatus?.privacy === 'Complete'} /> {affiliate.complianceStatus?.privacy || 'Missing'}</span>
              </div>
              <div className="flex justify-between py-3 border-b">
                <span className="font-medium text-slate-700">3. Tax information (via Stripe)</span>
                <span className="text-slate-900"><StatusIcon ok={affiliate.complianceStatus?.tax === 'Verified/complete'} /> {affiliate.complianceStatus?.tax || 'Missing'}</span>
              </div>
              <div className="flex justify-between py-3 border-b">
                <span className="font-medium text-slate-700">4. Payment Setup (Stripe)</span>
                <span className="text-slate-900"><StatusIcon ok={affiliate.complianceStatus?.payment === 'Complete'} /> {affiliate.complianceStatus?.payment || 'Missing'}</span>
              </div>
              <div className="flex justify-between py-3 border-b">
                <span className="font-medium text-slate-700">5. FTC Disclosure</span>
                <span className="text-slate-900"><StatusIcon ok={affiliate.complianceStatus?.ftc === 'Complete'} /> {affiliate.complianceStatus?.ftc || 'Missing'}</span>
              </div>
              <div className="flex justify-between py-3 border-b">
                <span className="font-medium text-slate-700">6. Marketing Guidelines</span>
                <span className="text-slate-900"><StatusIcon ok={affiliate.complianceStatus?.marketing === 'Complete'} /> {affiliate.complianceStatus?.marketing || 'Missing'}</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="font-medium text-slate-700">7. Admin Approval</span>
                <span className="text-slate-900"><StatusIcon ok={affiliate.complianceStatus?.adminApproval === 'Complete'} /> {affiliate.complianceStatus?.adminApproval || 'Missing'}</span>
              </div>
            </div>
            <div className="mt-4 text-xs text-slate-500">Tax IDs and payment details are entered only in Stripe-hosted onboarding. This app stores Stripe status flags, not a signed W-9 or a tax ID.</div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-6">Audit Log</h2>
            <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
              {affiliate.auditLog?.length > 0 ? (
                affiliate.auditLog.map((log: any) => (
                  <div key={log.id} className="text-sm pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                    <div className="flex justify-between font-medium text-slate-900">
                      <span>{log.eventType}</span>
                      <span className="text-slate-500 text-xs">{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                    {log.reason && <div className="text-slate-600 mt-1">Reason: {log.reason}</div>}
                    <div className="text-slate-500 mt-1 text-xs">Actor: {log.actorType}</div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No audit log entries found.</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {affiliate.affiliate?.status === 'pending' && (
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
              <h3 className="font-bold text-slate-900 text-lg">Pending application</h3>
              <p className="text-sm text-slate-600">
                Approval activates a paid affiliate and sends an email. It requires the owner-enabled reviewed
                agreement and this applicant’s acceptance; the server refuses approval otherwise.
                Disapproval keeps the application for audit but does not activate the affiliate.
              </p>
              <p className="text-sm text-slate-600">A permanent referral code is generated automatically on approval.</p>
              {affiliate.affiliate.applicationHeldAt && <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                On hold: {affiliate.affiliate.applicationHoldReason}
              </p>}
              <label className="block text-sm font-medium text-slate-700">
                Commission rate
                <select data-testid="select-commission-rate" value={commissionRatePct}
                  onChange={e => setCommissionRatePct(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2">
                  <option value={20}>20%</option><option value={10}>10%</option>
                </select>
              </label>
              <Button data-testid="button-approve-application" disabled={decision.isPending || !!affiliate.affiliate.applicationHeldAt}
                onClick={() => decideApplication('approve')}>Approve paid application</Button>
              {affiliate.affiliate.applicationHeldAt ? (
                <Button data-testid="button-release-application-hold" variant="outline" disabled={decision.isPending}
                  onClick={() => decideApplication('release-hold')}>Release hold</Button>
              ) : (
                <>
                  <label className="block text-sm font-medium text-slate-700">
                    Hold reason (required)
                    <textarea data-testid="input-application-hold-reason" value={holdReason}
                      onChange={e => setHoldReason(e.target.value)} rows={2}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" />
                  </label>
                  <Button data-testid="button-hold-application" variant="outline" disabled={decision.isPending}
                    onClick={() => decideApplication('hold')}>Hold application</Button>
                </>
              )}
              <label className="block text-sm font-medium text-slate-700">
                Reason for disapproval (required)
                <textarea data-testid="input-disapproval-reason" value={decisionReason}
                  onChange={e => setDecisionReason(e.target.value)} rows={2}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" />
              </label>
              <Button data-testid="button-disapprove-application" variant="outline" disabled={decision.isPending}
                onClick={() => decideApplication('reject')}>Disapprove application</Button>
            </div>
          )}
          <div className="bg-slate-900 text-white rounded-xl shadow-sm border border-slate-800 p-6">
            <h3 className="font-bold text-lg mb-2">Overall Status</h3>
            {affiliate.payoutEligibility ? (
              <div className="text-emerald-400 font-bold flex items-center gap-2 text-xl mb-4">
                <CheckCircle2 className="w-6 h-6" /> Eligible for Payouts
              </div>
            ) : (
              <div className="text-red-400 font-bold flex items-center gap-2 text-xl mb-4">
                <AlertCircle className="w-6 h-6" /> {affiliate.overallStatus || 'Not Eligible'}
              </div>
            )}
            
            {!affiliate.payoutEligibility && affiliate.blockingReasons?.length > 0 && (
              <div className="mt-4">
                <div className="text-sm text-slate-400 mb-2 font-medium">Blocking reasons:</div>
                <ul className="text-sm space-y-1">
                  {affiliate.blockingReasons.map((reason: string, i: number) => (
                    <li key={i} className="flex gap-2 text-slate-300">
                      <span className="text-red-400 mt-0.5">•</span> {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-slate-800">
              <Button 
                variant="secondary" 
                className="w-full bg-slate-800 text-white hover:bg-slate-700 border-slate-700" 
                onClick={() => remind.mutate()}
                disabled={remind.isPending || affiliate.payoutEligibility}
              >
                <Mail className="w-4 h-4 mr-2" />
                {remind.isPending ? 'Sending...' : 'Send Reminder Email'}
              </Button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="font-bold text-slate-900 text-lg mb-4">Admin Actions</h3>
            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Reason for compliance action (required)
                <textarea 
                  className="mt-1 block w-full rounded-md border-slate-300 border px-3 py-2 shadow-sm focus:border-slate-800 focus:ring-slate-800 sm:text-sm"
                  rows={2}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="outline" 
                  className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                  onClick={() => handleAction('approve')}
                  disabled={action.isPending || affiliate.affiliate?.status !== 'active'}
                >
                  Approve payout eligibility
                </Button>
                <Button 
                  variant="outline" 
                  className="text-red-700 border-red-200 hover:bg-red-50"
                  onClick={() => handleAction('place_hold')}
                  disabled={action.isPending}
                >
                  Place Hold
                </Button>
                <Button 
                  variant="outline" 
                  className="col-span-2 text-slate-700"
                  onClick={() => handleAction('release_hold')}
                  disabled={action.isPending}
                >
                  Remove Hold
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6 text-sm">
            <h3 className="font-bold text-slate-900 mb-4">Profile</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-slate-500 font-medium">Business Name</dt>
                <dd className="text-slate-900">{affiliate.businessName || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-slate-500 font-medium">Location</dt>
                <dd className="text-slate-900">{affiliate.state}, {affiliate.country}</dd>
              </div>
              <div>
                <dt className="text-slate-500 font-medium">Referral Code</dt>
                <dd className="text-slate-900">{affiliate.referralCode || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-slate-500 font-medium">Commission Balance</dt>
                <dd className="text-slate-900 font-bold">${(affiliate.commissionBalance || 0).toFixed(2)}</dd>
              </div>
              <div>
                <dt className="text-slate-500 font-medium">Stripe Account</dt>
                <dd className="text-slate-900">{affiliate.stripeConnectedAccountId ? 'Connected' : 'Not setup'}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
