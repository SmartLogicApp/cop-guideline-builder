import { useState } from 'react';
import { usePortalData, usePortalRegion, useAcknowledge, useAgreementAcceptance, usePaymentAuth, useStripeConnect } from './hooks';
import { AffiliateShell } from './shells';
import { Loader2, CheckCircle2, AlertCircle, Clock, XCircle, ArrowRight, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';

type Status = 'Not started' | 'Action needed' | 'Submitted' | 'Complete' | 'Under review' | 'Needs correction' | 'Not eligible' | 'Admin hold';

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

  const {
    overall_status,
    blocking_reasons = [],
    checklist = [],
    paymentAuthorizationText,
    paymentAuthorizationVersion,
    country,
    internationalReviewRequired
  } = portalData || {};

  const getStatusIcon = (status: Status) => {
    switch (status) {
      case 'Complete': return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
      case 'Under review':
      case 'Submitted': return <Clock className="w-5 h-5 text-amber-600" />;
      case 'Action needed':
      case 'Not started':
      case 'Needs correction': return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'Not eligible':
      case 'Admin hold': return <XCircle className="w-5 h-5 text-red-600" />;
      default: return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const agreement = checklist.find((c: any) => c.key === 'agreement');
  const privacy = checklist.find((c: any) => c.key === 'privacy');
  const tax = checklist.find((c: any) => c.key === 'tax');
  const payment = checklist.find((c: any) => c.key === 'payment');
  const ftc = checklist.find((c: any) => c.key === 'ftc');
  const marketing = checklist.find((c: any) => c.key === 'marketing');
  const admin = checklist.find((c: any) => c.key === 'admin');

  return (
    <AffiliateShell title="Payout Setup & Compliance" subtitle={`Status: ${overall_status.replace(/_/g, ' ')}`}>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-6">Compliance Checklist</h2>
            
            <div className="space-y-6">
              {/* Region Selector first if they haven't started tax/payment */}
              {(tax?.status === 'Not started' || payment?.status === 'Not started') && (
                <RegionSelector />
              )}
            
              {agreement && <AgreementItem agreement={agreement} document={portalData?.agreementDocument} icon={getStatusIcon(agreement.status)} />}
              <div className="border-t border-slate-100" />
              
              {privacy && <ChecklistItem title={`2. ${privacy.title}`} status={privacy.status}
                icon={getStatusIcon(privacy.status)} doc={privacy.document} viewUrl="/privacy" />}
              <div className="border-t border-slate-100" />
              
              {tax && (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <div className="mt-0.5">{getStatusIcon(tax.status)}</div>
                    <div>
                      <h3 className="font-semibold text-slate-900">3. {tax.title}</h3>
                      <p className="text-sm text-slate-500 mt-1">Status: {tax.status}</p>
                      {tax.message && <p className="text-sm text-amber-700 mt-1">{tax.message}</p>}
                    </div>
                  </div>
                </div>
              )}
              <div className="border-t border-slate-100" />
              
              {payment && (
                <PaymentSetupItem 
                  status={payment.status} 
                  message={payment.message} 
                  authText={paymentAuthorizationText} 
                  authVersion={paymentAuthorizationVersion} 
                  internationalReviewRequired={internationalReviewRequired}
                />
              )}
              <div className="border-t border-slate-100" />
              
              {ftc && (
                <ChecklistItem 
                  title={`5. ${ftc.title}`}
                  status={ftc.status} 
                  icon={getStatusIcon(ftc.status)}
                  doc={ftc.document}
                />
              )}
              <div className="border-t border-slate-100" />
              
              {marketing && (
                <ChecklistItem 
                  title={`6. ${marketing.title}`}
                  status={marketing.status} 
                  icon={getStatusIcon(marketing.status)}
                  doc={marketing.document}
                />
              )}
              <div className="border-t border-slate-100" />
              
              {admin && (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <div className="mt-0.5">{getStatusIcon(admin.status)}</div>
                    <div>
                      <h3 className="font-semibold text-slate-900">7. {admin.title}</h3>
                      <p className="text-sm text-slate-500 mt-1">Status: {admin.status}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-50 rounded-2xl border p-6">
            <h3 className="font-bold text-slate-900 text-lg">Why can't I be paid yet?</h3>
            {blocking_reasons.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {blocking_reasons.map((reason: string, i: number) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> You are eligible for payouts.
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
    </AffiliateShell>
  );
}

function AgreementItem({ agreement, document, icon }: { agreement: any; document: any; icon: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const accept = useAgreementAcceptance();
  const { toast } = useToast();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await accept.mutateAsync({ agreementVersion: document.version, typedLegalName: name, agreed });
      toast({ title: 'Agreement accepted', description: 'Your signed acknowledgement has been recorded.' });
      setOpen(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Unable to accept agreement', description: error.message });
    }
  };

  return <section className="space-y-3">
    <div className="flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div>
        <h3 className="font-semibold text-slate-900">1. {agreement.title}</h3>
        <p className="text-sm text-slate-500">Status: {agreement.status}</p>
      </div>
    </div>
    {agreement.status !== 'Complete' && (document?.body ? <>
      <a href="#current-affiliate-agreement" onClick={() => setOpen(true)} className="text-sm font-medium text-teal-800 underline">
        View current agreement (version {document.version})
      </a>
      {open && <div id="current-affiliate-agreement" className="space-y-4">
        <div className="max-h-72 overflow-y-auto rounded-lg border bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap">{document.body}</div>
        <form onSubmit={submit} className="space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-1" />
            <span>I have read and agree to this version of the Affiliate Partner Agreement.</span>
          </label>
          <label className="block text-sm font-medium">Type your full legal name
            <input required value={name} onChange={e => setName(e.target.value)} autoComplete="name" className="mt-1 block w-full rounded-md border px-3 py-2" />
          </label>
          <Button type="submit" disabled={!agreed || !name.trim() || accept.isPending}>{accept.isPending ? 'Saving…' : 'Accept agreement'}</Button>
        </form>
      </div>}
    </> : <p className="text-sm text-amber-800">The current reviewed agreement is not available yet. Contact the program administrator.</p>)}
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

function ChecklistItem({ title, status, icon, doc, viewUrl }: { title: string, status: Status, icon: React.ReactNode, doc: any, viewUrl?: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const ack = useAcknowledge();
  const { toast } = useToast();

  const handleAck = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ack.mutateAsync({
        documentVersionId: doc.id,
        typedLegalName: name,
        agreed
      });
      setOpen(false);
      toast({ title: "Acknowledgement saved", description: "Your response has been recorded." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="mt-0.5">{icon}</div>
          <div>
            <h3 className="font-semibold text-slate-900">{title}</h3>
            <p className="text-sm text-slate-500 mt-1">Status: {status}</p>
          </div>
        </div>
        {status !== 'Complete' && doc && (
          <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
            Review & Accept
          </Button>
        )}
      </div>

      {open && doc && (
        <form onSubmit={handleAck} className="mt-4 bg-slate-50 p-5 rounded-xl border border-slate-200">
          {viewUrl && <a className="mb-3 inline-block text-sm font-medium text-teal-800 underline" href={viewUrl} target="_blank" rel="noopener noreferrer">
            View current document version {doc.version}
          </a>}
          <div className="prose prose-sm max-w-none text-slate-700 max-h-60 overflow-y-auto bg-white p-4 rounded border mb-4 whitespace-pre-wrap">
            {doc.content}
          </div>
          
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-900">
              Typed legal name
              <input 
                type="text" 
                required 
                value={name}
                onChange={e => setName(e.target.value)}
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
                I have read and agree to the {doc.title} (Version {doc.version}).
              </span>
            </label>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!agreed || !name || ack.isPending} className="bg-teal-800 hover:bg-teal-900 text-white">
                {ack.isPending ? 'Saving...' : 'Submit'}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

function PaymentSetupItem({ status, message, authText, authVersion, internationalReviewRequired }: { status: Status, message?: string, authText?: string, authVersion?: string, internationalReviewRequired?: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const payAuth = usePaymentAuth();
  const connect = useStripeConnect();
  const { toast } = useToast();

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (status !== 'Complete' && status !== 'Submitted') {
        await payAuth.mutateAsync({ typedLegalName: name, agreed });
      }
      const res = await connect.mutateAsync();
      if (res.url) {
        window.location.href = res.url;
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const icon = status === 'Complete' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-red-600" />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="mt-0.5">{icon}</div>
          <div>
            <h3 className="font-semibold text-slate-900">4. Payment setup</h3>
            <p className="text-sm text-slate-500 mt-1">Status: {status}</p>
            {message && <p className="text-sm text-amber-700 mt-1">{message}</p>}
          </div>
        </div>
        {status !== 'Complete' && !internationalReviewRequired && !message?.includes('Submit your country') && (
          <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
            Set up secure payments
          </Button>
        )}
      </div>

      {open && (
        <form onSubmit={handleStart} className="mt-4 bg-slate-50 p-5 rounded-xl border border-slate-200">
          <p className="text-sm text-slate-700 mb-4 bg-white p-4 rounded border whitespace-pre-wrap">
            {authText || 'Loading authorization terms...'}
          </p>
          
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-900">
              Typed legal name
              <input 
                type="text" 
                required 
                value={name}
                onChange={e => setName(e.target.value)}
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
                I agree to the payment authorization terms above (Version {authVersion}).
              </span>
            </label>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!agreed || !name || payAuth.isPending || connect.isPending} className="bg-teal-800 hover:bg-teal-900 text-white">
                {payAuth.isPending || connect.isPending ? 'Redirecting to Stripe...' : 'Continue to secure payment setup'}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
