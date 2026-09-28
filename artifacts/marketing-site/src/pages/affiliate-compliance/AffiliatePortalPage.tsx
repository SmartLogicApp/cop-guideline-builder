import { useState } from 'react';
import { usePortalData, usePortalPayouts, usePortalRegion, useAcknowledge, usePaymentAuth, useStripeConnect } from './hooks';
import { AffiliateShell } from './shells';
import { Loader2, CheckCircle2, AlertCircle, XCircle, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { checklistAcceptanceDetails, isChecklistComplete, payoutChecklistNeedsRegion, payoutChecklistProgress, PAYOUT_CHECKLIST_ORDER, type AffiliatePortalData, type PayoutChecklistItem } from './types';
import { PayoutStatement, PayoutStatus } from './PayoutStatement';

export default function AffiliatePortalPage() {
  const { data: portalData, isLoading, error } = usePortalData();

  if (isLoading) return <AffiliateShell title="Affiliate Portal"><div className="flex justify-center p-12"><Loader2 className="animate-spin text-teal-800" /></div></AffiliateShell>;
  
  if (error) return (
    <AffiliateShell title="Affiliate Portal">
      <div className="bg-red-50 text-red-800 p-6 rounded-xl border border-red-200">
        <h2 className="font-semibold text-lg flex items-center gap-2"><AlertCircle className="w-5 h-5" /> Error loading portal</h2>
        <p className="mt-2 text-sm">{error.message || 'Could not load your portal data.'}</p>
      </div>
    </AffiliateShell>
  );

  const data = portalData as AffiliatePortalData | undefined;
  const checklist = data?.checklist ?? [];
  const progress = payoutChecklistProgress(checklist, data?.eligible === true);
  const blockingReasons = data?.blocking_reasons ?? [];
  const regionNeeded = payoutChecklistNeedsRegion(checklist);

  return (
    <AffiliateShell title="Get paid" subtitle="Complete your affiliate payout checklist">
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border p-6">
            <div className="mb-6 border-b border-slate-100 pb-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-800">Get paid</p>
              <h2 className="mt-2 text-xl font-bold text-slate-900" data-testid="payout-checklist-progress">
                {progress.heading}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Complete the seven compliance steps below. The $100 minimum and 60-day commission holdback are evaluated separately.
              </p>
            </div>

            <div className="space-y-5">
              {regionNeeded && (
                <RegionSelector />
              )}
              {progress.items.map((item, index) => {
                const number = PAYOUT_CHECKLIST_ORDER.indexOf(item.key) + 1;
                return (
                  <div key={item.key} className={index > 0 ? 'border-t border-slate-100 pt-5' : ''}>
                    {item.key === 'privacy' || item.key === 'ftc' || item.key === 'marketing' ? (
                      <DocumentAcknowledgementItem item={item} number={number} />
                    ) : item.key === 'tax' || item.key === 'payment' ? (
                      <ConnectSetupItem
                        item={item}
                        number={number}
                        authorizationText={data?.paymentAuthorizationText}
                        authorizationVersion={data?.paymentAuthorizationVersion}
                        authorizationAccepted={data?.paymentAuthorizationAccepted === true}
                        regionNeeded={regionNeeded}
                        internationalReviewRequired={data?.internationalReviewRequired === true}
                      />
                    ) : (
                      <ChecklistStatusItem item={item} number={number} />
                    )}
                  </div>
                );
              })}
              {progress.items.length !== 7 && (
                <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  The server checklist is incomplete. Refresh the page or contact support before relying on payout status.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-50 rounded-2xl border p-6">
            <h3 className="font-bold text-slate-900 text-lg">Payout timing and eligibility</h3>
            <p className="mt-2 text-sm text-slate-600">
              Each commission has a 60-day holdback, and a payout requires at least $100 in payable commissions. These thresholds are separate from the seven checklist steps.
            </p>
            {blockingReasons.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {blockingReasons.map((reason: string, i: number) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            ) : data?.eligible ? (
              <p className="mt-4 text-sm text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Your payout requirements are met.
              </p>
            ) : (
              <p className="mt-4 text-sm text-slate-700">
                Payout eligibility has not been confirmed. Refresh the portal or contact support.
              </p>
            )}
          </div>
          
          <div className="bg-white rounded-2xl shadow-sm border p-6 text-sm text-slate-600">
            <h4 className="font-semibold text-slate-900 mb-2">Need help?</h4>
            <p>If you have questions about your compliance status or need assistance with onboarding, our support team can help.</p>
            <a href="mailto:HelpCMSComplianceGuardian@outlook.com" className="mt-3 inline-flex items-center font-medium text-teal-800 hover:text-teal-900">
              Contact support <ArrowRight className="ml-1 w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
      <PortalPayoutHistory />
    </AffiliateShell>
  );
}

function PortalPayoutHistory() {
  const { data: payouts, isLoading, error, refetch } = usePortalPayouts();
  const [openId, setOpenId] = useState<string | null>(null);
  return <section className="mt-8" aria-label="Your payouts">
    <div className="mb-4">
      <p className="text-xs font-bold uppercase tracking-wider text-teal-800">Your record</p>
      <h2 className="mt-1 text-xl font-bold text-slate-900">Payouts & statements</h2>
      <p className="mt-1 text-sm text-slate-600">Review the client payments and frozen commission rates behind each payout.</p>
    </div>
    {isLoading ? <div role="status" className="space-y-3 animate-pulse" data-testid="loading-portal-payouts">
      <div className="h-20 rounded-xl bg-slate-100" /><div className="h-20 rounded-xl bg-slate-100" /><span className="sr-only">Loading payouts</span>
    </div> : error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" data-testid="error-portal-payouts">
      Could not load your payouts: {error.message} <Button type="button" variant="outline" size="sm" className="ml-2" onClick={() => void refetch()} data-testid="button-retry-portal-payouts">Retry</Button>
    </div> : payouts?.length ? <div className="space-y-3">
      {payouts.map(payout => <div key={payout.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm" data-testid={`card-payout-${payout.id}`}>
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900">
              {new Date(payout.payoutPeriodStart).toLocaleDateString('en-US', { timeZone: 'UTC' })} – {new Date(payout.payoutPeriodEnd).toLocaleDateString('en-US', { timeZone: 'UTC' })}
            </span><PayoutStatus status={payout.payoutStatus} /></div>
            <p className="mt-1 text-sm text-slate-600">{payout.payoutStatus === 'paid' ? 'Paid' : 'Not paid'} · Net {new Intl.NumberFormat('en-US', { style: 'currency', currency: payout.currency || 'USD' }).format(Number(payout.netPayoutAmount))}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpenId(current => current === payout.id ? null : payout.id)}
            aria-expanded={openId === payout.id} aria-controls={`portal-statement-${payout.id}`} data-testid={`button-toggle-statement-${payout.id}`}>
            {openId === payout.id ? 'Hide statement' : 'View statement'}
          </Button>
        </div>
        {openId === payout.id && <div id={`portal-statement-${payout.id}`} className="border-t p-3 sm:p-5">
          <PayoutStatement scope="portal" id={payout.id} />
        </div>}
      </div>)}
    </div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center" data-testid="empty-portal-payouts">
      <h3 className="font-semibold text-slate-900">No payouts yet</h3>
      <p className="mt-2 text-sm text-slate-600">When commissions qualify and a payout is prepared, its statement will appear here.</p>
    </div>}
  </section>;
}

function RegionSelector() {
  const [country, setCountry] = useState('US');
  const [state, setState] = useState('');
  const region = usePortalRegion();
  const { toast } = useToast();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await region.mutateAsync({ country, state });
      toast({ title: "Region saved", description: "You can now continue setup." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  return (
    <form onSubmit={handleSave} className="bg-slate-50 p-5 rounded-xl border border-slate-200 mb-6">
      <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-amber-600" />
        Please confirm your location to continue
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm font-medium text-slate-700">
          Country
          <select 
            value={country} onChange={e => setCountry(e.target.value)} required
            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-teal-700 focus:ring-teal-700 sm:text-sm px-3 py-2 border bg-white"
          >
            <option value="US">United States</option>
            <option value="CA">Canada</option>
            <option value="GB">United Kingdom</option>
            <option value="AU">Australia</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          State / Province
          <input 
            type="text" required value={state} onChange={e => setState(e.target.value)}
            placeholder="e.g. CA, NY, Ontario"
            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-teal-700 focus:ring-teal-700 sm:text-sm px-3 py-2 border bg-white" 
          />
        </label>
      </div>
      <Button type="submit" disabled={region.isPending} className="mt-4 bg-slate-900 text-white">
        {region.isPending ? 'Saving...' : 'Save Location'}
      </Button>
    </form>
  );
}

function ChecklistStatusItem({ item, number }: { item: PayoutChecklistItem; number: number }) {
  const complete = isChecklistComplete(item);
  const acceptance = checklistAcceptanceDetails(item);
  const Icon = complete ? CheckCircle2 : XCircle;

  return (
    <div className="flex items-start gap-3">
      <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${complete ? 'text-emerald-600' : 'text-red-600'}`} aria-label={complete ? 'Complete' : 'Action needed'} />
      <div>
        <h3 className="font-semibold text-slate-900">{number}. {item.title}</h3>
        <p className={`mt-1 text-sm ${complete ? 'text-emerald-700' : 'text-red-700'}`}>
          {complete ? 'Complete' : item.status}
        </p>
        {item.key === 'agreement' && (complete
          ? <p className="mt-1 text-sm text-slate-600">Accepted with your affiliate signup.</p>
          : <p className="mt-1 text-sm text-red-700">The signup agreement record could not be confirmed.</p>)}
        {item.key === 'admin' && !complete && item.message && <p className="mt-1 text-sm text-red-700">{item.message}</p>}
        {acceptance && <p className="mt-1 text-xs text-slate-500">
          Acknowledged version {acceptance.version} on {new Date(acceptance.timestamp).toLocaleString()}
        </p>}
        {!complete && item.action?.type === 'contact_admin' && (
          <a className="mt-2 inline-block text-sm font-medium text-teal-800 underline" href="mailto:HelpCMSComplianceGuardian@outlook.com">
            {item.action.label}
          </a>
        )}
      </div>
    </div>
  );
}

function DocumentAcknowledgementItem({ item, number }: { item: PayoutChecklistItem; number: number }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const ack = useAcknowledge();
  const { toast } = useToast();
  const document = item.document;
  const acknowledgeAction = item.action?.type === 'acknowledge_document' ? item.action : null;

  const handleAck = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ack.mutateAsync({
        documentVersionId: acknowledgeAction?.documentVersionId ?? document?.id ?? '',
        typedLegalName: name.trim(),
        agreed,
      });
      setOpen(false);
      setName('');
      setAgreed(false);
      toast({ title: 'Acknowledgement saved', description: 'Your response has been recorded.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Unable to save acknowledgement', description: err.message });
    }
  };

  const acceptance = checklistAcceptanceDetails(item);
  const complete = isChecklistComplete(item);
  const Icon = complete ? CheckCircle2 : XCircle;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${complete ? 'text-emerald-600' : 'text-red-600'}`} aria-label={complete ? 'Complete' : 'Action needed'} />
          <div>
            <h3 className="font-semibold text-slate-900">{number}. {item.title}</h3>
            <p className={`mt-1 text-sm ${complete ? 'text-emerald-700' : 'text-red-700'}`}>
              {complete ? 'Complete' : item.status}
            </p>
            {acceptance && <p className="mt-1 text-xs text-slate-500">
              Acknowledged version {acceptance.version} on {new Date(acceptance.timestamp).toLocaleString()}
            </p>}
          </div>
        </div>
        {!complete && document && acknowledgeAction && (
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? 'Close document' : 'Open document'}
          </Button>
        )}
      </div>

      {!complete && (!document || !acknowledgeAction) && (
        <p className="ml-8 text-sm text-red-700">The current published document is unavailable. Contact support.</p>
      )}

      {open && document && (
        <form onSubmit={handleAck} className="mt-4 bg-slate-50 p-5 rounded-xl border border-slate-200">
          {document.url && <a className="mb-3 inline-block text-sm font-medium text-teal-800 underline" href={document.url} target="_blank" rel="noopener noreferrer">
            Open published document in a new tab (version {document.version})
          </a>}
          <div className="prose prose-sm max-w-none text-slate-700 max-h-72 overflow-y-auto bg-white p-4 rounded border mb-4 whitespace-pre-wrap" data-testid={`document-content-${item.key}`}>
            {document.content}
          </div>
          
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-900">
              Typed legal name
              <input 
                type="text" 
                required 
                value={name}
                onChange={e => setName(e.target.value)}
                autoComplete="name"
                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-teal-700 focus:ring-teal-700 sm:text-sm px-3 py-2 border bg-white" 
              />
            </label>
            
            <label className="flex items-start gap-3">
              <input 
                type="checkbox" 
                required 
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                className="mt-1 border-slate-300 text-teal-800 focus:ring-teal-700 rounded" 
              />
              <span className="text-sm text-slate-700">
                I have read the {document.title ?? item.title} and acknowledge version {document.version}.
              </span>
            </label>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!agreed || !name.trim() || ack.isPending || !document.id} className="bg-teal-800 hover:bg-teal-900 text-white">
                {ack.isPending ? 'Saving…' : acknowledgeAction?.label ?? 'I acknowledge'}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

function ConnectSetupItem({
  item,
  number,
  authorizationText,
  authorizationVersion,
  authorizationAccepted,
  regionNeeded,
  internationalReviewRequired,
}: {
  item: PayoutChecklistItem;
  number: number;
  authorizationText?: string | null;
  authorizationVersion?: string | null;
  authorizationAccepted: boolean;
  regionNeeded: boolean;
  internationalReviewRequired: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const payAuth = usePaymentAuth();
  const connect = useStripeConnect();
  const { toast } = useToast();
  const complete = isChecklistComplete(item);
  const Icon = complete ? CheckCircle2 : XCircle;
  const setupAction = item.action?.type === 'set_up_payouts' ? item.action : null;
  const needsRegion = item.action?.type === 'set_region' || regionNeeded;

  const openStripeOnboarding = async () => {
    try {
      const res = await connect.mutateAsync();
      if (!res.url) throw new Error('Stripe did not return a secure onboarding link.');
      window.location.assign(res.url);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Unable to open Stripe onboarding', description: err.message });
    }
  };

  const startSetup = () => {
    if (!setupAction || internationalReviewRequired) return;
    if (authorizationAccepted) {
      void openStripeOnboarding();
      return;
    }
    setOpen((value) => !value);
  };

  const acceptAndContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await payAuth.mutateAsync({ typedLegalName: name.trim(), agreed });
      setOpen(false);
      await openStripeOnboarding();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Unable to set up payouts', description: err.message });
    }
  };

  const acceptance = checklistAcceptanceDetails(item);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${complete ? 'text-emerald-600' : 'text-red-600'}`} aria-label={complete ? 'Complete' : 'Action needed'} />
          <div>
            <h3 className="font-semibold text-slate-900">{number}. {item.title}</h3>
            <p className={`mt-1 text-sm ${complete ? 'text-emerald-700' : 'text-red-700'}`}>
              {complete ? 'Complete' : item.status}
            </p>
            {item.message && <p className="mt-1 text-sm text-slate-600">{item.message}</p>}
            {acceptance && <p className="mt-1 text-xs text-slate-500">
              Acknowledged version {acceptance.version} on {new Date(acceptance.timestamp).toLocaleString()}
            </p>}
          </div>
        </div>
        {!complete && setupAction && !internationalReviewRequired && (
          <Button type="button" variant="outline" size="sm" onClick={startSetup} disabled={connect.isPending || payAuth.isPending}>
            {connect.isPending ? 'Opening Stripe…' : setupAction.label}
          </Button>
        )}
      </div>

      {needsRegion && !complete && <p className="ml-8 text-sm text-red-700">Confirm your location above before setting up payouts.</p>}
      {internationalReviewRequired && !complete && <p className="ml-8 text-sm text-red-700">Stripe payout setup is not available for your region yet.</p>}
      {open && !authorizationAccepted && (
        <form onSubmit={acceptAndContinue} className="mt-4 bg-slate-50 p-5 rounded-xl border border-slate-200">
          <p className="text-sm text-slate-700 mb-4 bg-white p-4 rounded border whitespace-pre-wrap">
            {authorizationText || 'The current payment authorization is unavailable. Please contact support.'}
          </p>
          {authorizationVersion && <p className="mb-4 text-xs text-slate-500">Version {authorizationVersion}</p>}
          
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-900">
              Typed legal name
              <input 
                type="text" 
                required 
                value={name}
                onChange={e => setName(e.target.value)}
                autoComplete="name"
                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-teal-700 focus:ring-teal-700 sm:text-sm px-3 py-2 border bg-white" 
              />
            </label>
            
            <label className="flex items-start gap-3">
              <input 
                type="checkbox" 
                required 
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                className="mt-1 border-slate-300 text-teal-800 focus:ring-teal-700 rounded" 
              />
              <span className="text-sm text-slate-700">
                I have read and agree to the payment authorization terms above (Version {authorizationVersion}).
              </span>
            </label>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!agreed || !name.trim() || !authorizationText || payAuth.isPending || connect.isPending} className="bg-teal-800 hover:bg-teal-900 text-white">
                {payAuth.isPending || connect.isPending ? 'Opening Stripe…' : 'I agree & set up payouts'}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
