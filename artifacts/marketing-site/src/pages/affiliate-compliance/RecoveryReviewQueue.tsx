import { useState, type FormEvent } from 'react';
import { AlertCircle, RotateCcw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAdminAccountAccess, useAdminRecoveryReviews, useResolveRecoveryReview } from './hooks';
import { recoveryResolutionIsValid, type RecoveryDecision, type PaidCommissionRecoveryReview } from './types';

const money = (value: string | number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));

export function RecoveryReviewQueue() {
  const reviews = useAdminRecoveryReviews();
  const access = useAdminAccountAccess(true);
  const resolve = useResolveRecoveryReview();
  const { toast } = useToast();
  const [openInvoice, setOpenInvoice] = useState<string | null>(null);
  const [decision, setDecision] = useState<RecoveryDecision | null>(null);
  const [reason, setReason] = useState('');
  const isSuperAdmin = access.data?.isSuperAdmin === true && !access.isFetching && !access.isError;

  const selectReview = (invoiceId: string) => {
    setOpenInvoice(current => current === invoiceId ? null : invoiceId);
    setDecision(null);
    setReason('');
    resolve.reset();
  };

  const handleResolve = async (event: FormEvent, review: PaidCommissionRecoveryReview) => {
    event.preventDefault();
    if (!isSuperAdmin || !recoveryResolutionIsValid(decision, reason) || !decision) return;
    try {
      await resolve.mutateAsync({ invoiceId: review.stripeInvoiceId, decision, reason: reason.trim() });
      toast({
        title: decision === 'recovered' ? 'Review recorded as recovered' : 'Recovery waived',
        description: decision === 'recovered'
          ? 'The review is closed. This action only records recovery; it does not transfer funds.'
          : 'The review is closed without recording recovery of funds.',
      });
      setOpenInvoice(null);
      setDecision(null);
      setReason('');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Could not resolve review', description: (error as Error).message });
    }
  };

  return <section className="mb-6 rounded-xl border bg-white p-5 shadow-sm sm:p-6" aria-label="Paid commission recovery reviews">
    <div className="flex items-start gap-3">
      <div className="rounded-lg bg-amber-100 p-2 text-amber-800"><RotateCcw className="h-5 w-5" /></div>
      <div>
        <h2 className="text-lg font-bold text-slate-900">Paid commission recovery reviews</h2>
        <p className="mt-1 text-sm text-slate-600">Refunds or disputes after a commission was paid need a manual decision. Marking a review recovered only records a verified recovery; it does not move money. A waiver closes the review without recovery.</p>
      </div>
    </div>

    {reviews.isLoading ? <div role="status" className="mt-5 space-y-3 animate-pulse" data-testid="loading-recovery-reviews">
      <div className="h-16 rounded bg-slate-100" /><div className="h-16 rounded bg-slate-100" /><span className="sr-only">Loading recovery reviews</span>
    </div> : reviews.isError ? <div role="alert" className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" data-testid="error-recovery-reviews">
      <AlertCircle className="h-4 w-4" /> Could not load recovery reviews: {reviews.error.message}
      <Button type="button" size="sm" variant="outline" onClick={() => void reviews.refetch()} data-testid="button-retry-recovery-reviews">Retry</Button>
    </div> : !reviews.data?.length ? <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-5 py-7 text-center" data-testid="empty-recovery-reviews">
      <p className="font-semibold text-slate-900">No reviews waiting</p>
      <p className="mt-1 text-sm text-slate-600">Paid-commission refund and dispute reviews will appear here when action is needed.</p>
    </div> : <div className="mt-5 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800" data-testid="text-recovery-review-count">{reviews.data.length} awaiting review</p>
      {reviews.data.map(review => <article key={review.stripeInvoiceId} className="rounded-lg border border-slate-200 bg-slate-50" data-testid={`card-recovery-review-${review.stripeInvoiceId}`}>
        <div className="flex flex-wrap items-start justify-between gap-4 p-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-slate-900">{review.affiliateName || review.affiliateId}</h3>
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Manual review</span>
            </div>
            <p className="text-xs text-slate-500">Affiliate ID: <span className="font-mono">{review.affiliateId}</span>{review.clientName ? ` · Client: ${review.clientName}` : ''}</p>
            <p className="break-all text-xs text-slate-600">Stripe invoice: <span className="font-mono">{review.stripeInvoiceId}</span>
              {review.stripePaymentIntentId && <> · Payment: <span className="font-mono">{review.stripePaymentIntentId}</span></>}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700">
              <span>Charge <strong className="text-slate-900">{money(review.chargeAmountUsd)}</strong></span>
              <span>Refunded <strong className="text-slate-900">{money(review.refundedAmountUsd)}</strong></span>
              {review.commissionAmountUsd != null && <span>Commission <strong className="text-slate-900">{money(review.commissionAmountUsd)}</strong></span>}
              {review.disputeStatus && <span>Dispute <strong className="text-slate-900">{review.disputeStatus.replace(/_/g, ' ')}</strong></span>}
            </div>
            <p className="text-sm text-amber-900"><strong>Review reason:</strong> {review.recoveryReviewReason}</p>
            <p className="text-xs text-slate-500">Updated {new Date(review.updatedAt).toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' })}</p>
          </div>
          {isSuperAdmin && <Button type="button" variant="outline" size="sm" onClick={() => selectReview(review.stripeInvoiceId)}
            aria-expanded={openInvoice === review.stripeInvoiceId} aria-controls={`recovery-action-${review.stripeInvoiceId}`}
            data-testid={`button-review-recovery-${review.stripeInvoiceId}`}>
            {openInvoice === review.stripeInvoiceId ? 'Close review' : 'Resolve review'}
          </Button>}
        </div>
        {openInvoice === review.stripeInvoiceId && isSuperAdmin && <form id={`recovery-action-${review.stripeInvoiceId}`}
          onSubmit={event => void handleResolve(event, review)} className="space-y-4 border-t border-slate-200 bg-white p-4">
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">Choose a resolution</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                <input type="radio" name={`decision-${review.stripeInvoiceId}`} value="recovered" checked={decision === 'recovered'}
                  onChange={() => setDecision('recovered')} className="mt-1" data-testid={`radio-recovered-${review.stripeInvoiceId}`} />
                <span><strong className="block text-slate-900">Recovered</strong>Use only after funds were recovered separately and verified. This does not initiate a transfer.</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                <input type="radio" name={`decision-${review.stripeInvoiceId}`} value="waived" checked={decision === 'waived'}
                  onChange={() => setDecision('waived')} className="mt-1" data-testid={`radio-waived-${review.stripeInvoiceId}`} />
                <span><strong className="block text-slate-900">Waived</strong>Close this review without recovering funds. Record why recovery is not being pursued.</span>
              </label>
            </div>
          </fieldset>
          <label className="block text-sm font-medium text-slate-900">Written explanation (at least 10 characters)
            <textarea required minLength={10} rows={3} value={reason} onChange={event => setReason(event.target.value)}
              placeholder={decision === 'recovered' ? 'Describe how recovery was verified…' : 'Explain why recovery is waived…'}
              className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-800 focus:outline-none"
              data-testid={`textarea-recovery-reason-${review.stripeInvoiceId}`} />
          </label>
          {resolve.isError && <p role="alert" className="text-sm text-red-700" data-testid="error-recovery-resolution">{resolve.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => selectReview(review.stripeInvoiceId)}>Cancel</Button>
            <Button type="submit" disabled={!recoveryResolutionIsValid(decision, reason) || resolve.isPending}
              className="bg-slate-900 text-white hover:bg-slate-800" data-testid={`button-submit-recovery-${review.stripeInvoiceId}`}>
              {resolve.isPending ? 'Saving decision…' : decision === 'recovered' ? 'Record verified recovery' : decision === 'waived' ? 'Waive recovery' : 'Choose a resolution'}
            </Button>
          </div>
        </form>}
      </article>)}
    </div>}
    {reviews.data?.length ? <div className="mt-4 text-sm text-slate-600" data-testid="status-recovery-access">
      {access.isFetching || access.isLoading ? 'Checking Super Admin permission…'
        : access.isError ? <span className="flex flex-wrap items-center gap-2 text-amber-900"><ShieldAlert className="h-4 w-4" /> Could not verify Super Admin permission. Decisions are disabled.
          <Button type="button" variant="outline" size="sm" onClick={() => void access.refetch()} data-testid="button-retry-recovery-access">Retry</Button></span>
          : !isSuperAdmin ? 'Only a Super Admin can resolve paid-commission recovery reviews.' : null}
    </div> : null}
  </section>;
}