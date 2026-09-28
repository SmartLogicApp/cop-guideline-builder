import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, AlertCircle, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useDownloadPayoutStatement, usePayoutStatement } from './hooks';
import { billingMonthUTC, payoutStatusLabel, type PayoutStatement as PayoutStatementData } from './types';
import './payout-statement-print.css';

const usd = (value: string | number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));

const dateUTC = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
};

function billingMonthSourceLabel(source: string): string {
  if (source === 'invoice_line_period') return 'Recurring invoice period';
  if (source === 'invoice_period') return 'Invoice period';
  return 'Estimated from payment month';
}

export function PayoutStatus({ status, print = false }: { status: string; print?: boolean }) {
  const tone = status === 'paid'
    ? 'bg-emerald-100 text-emerald-800'
    : /held|hold|review|pending|processing/.test(status)
      ? 'bg-amber-100 text-amber-900'
      : /revers|void|fail/.test(status)
        ? 'bg-red-100 text-red-800'
        : 'bg-slate-100 text-slate-700';
  return <span data-testid={print ? undefined : `status-payout-${status}`} className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${tone}`}>{payoutStatusLabel(status)}</span>;
}

function StatementContent({ data, id, print = false }: { data: PayoutStatementData; id: string; print?: boolean }) {
  const { payout, adjustmentLines = [] } = data;
  const testId = (name: string) => print ? undefined : `${name}-${id}`;
  return <div className={print ? 'payout-statement-paper' : ''}>
    {print && <header className="payout-print-header">
      <div><span className="payout-print-eyebrow">CMS Compliance Suite · Affiliate program</span><h1>Payout statement</h1></div>
      <span className="payout-print-id">Statement {payout.id}</span>
    </header>}
    <div className={print ? 'payout-print-metadata' : 'mt-4 grid gap-x-6 gap-y-3 border-b border-slate-200 pb-5 text-sm sm:grid-cols-2 lg:grid-cols-3'}>
      <div><span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Affiliate</span><strong className="font-medium text-slate-900" data-testid={testId('text-statement-affiliate')}>{payout.affiliateName || payout.affiliateId}</strong></div>
      <div><span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Affiliate ID</span><span className="break-all" data-testid={testId('text-statement-affiliate-id')}>{payout.affiliateId}</span></div>
      <div><span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Payout ID</span><span className="break-all" data-testid={testId('text-statement-id')}>{payout.id}</span></div>
      {payout.quarter && <div><span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Quarter</span><span data-testid={testId('text-statement-quarter')}>{payout.quarter}</span></div>}
      <div><span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Status / payment date</span><span data-testid={testId('text-payment-state')}>{payoutStatusLabel(payout.payoutStatus)}{payout.paidAt ? ` · ${dateUTC(payout.paidAt)}` : ' · Not paid'}</span></div>
      <div><span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Currency</span><span>{payout.currency}</span></div>
      <div><span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Stripe transfer ID</span><span className="break-all" data-testid={testId('text-statement-transfer')}>{payout.stripeTransferId || 'Not sent'}</span></div>
    </div>
    <div className={print ? '' : 'mt-4 overflow-x-auto'}>
      <table className={print ? 'payout-print-table' : 'w-full min-w-[760px] text-left text-sm'}>
        <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <th className="py-3 pr-4">Client</th><th className="py-3 pr-4">Billing month (UTC)</th>
          <th className="py-3 pr-4 text-right">Client payment</th><th className="py-3 pr-4 text-right">Frozen rate</th>
          <th className="py-3 pr-4 text-right">Commission</th><th className="py-3">Status / holdback release</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-200">
          {data.lines.map((line, index) => <tr key={`${line.clientName}-${line.billingMonth}-${index}`} data-testid={print ? undefined : `row-statement-line-${id}-${index}`}>
            <td className="py-3 pr-4 font-medium text-slate-900">{line.clientName}</td>
            <td className="py-3 pr-4">
              {billingMonthUTC(line.billingMonth)}
              <span className="mt-1 block text-xs text-slate-500">{billingMonthSourceLabel(line.billingMonthSource)}</span>
            </td>
            <td className="py-3 pr-4 text-right tabular-nums">{usd(line.clientPaymentUsd)}</td>
            <td className="py-3 pr-4 text-right tabular-nums">{Number(line.commissionRatePct).toLocaleString('en-US')}%</td>
            <td className="py-3 pr-4 text-right tabular-nums font-medium">{usd(line.commissionAmountUsd)}</td>
            <td className="py-3"><PayoutStatus status={line.commissionStatus} print={print} />{line.holdbackReleaseAt && <span className="mt-1 block text-xs text-slate-500" data-testid={print ? undefined : `text-holdback-release-${id}-${index}`}>Release: {dateUTC(line.holdbackReleaseAt)}</span>}</td>
          </tr>)}
        </tbody>
      </table>
      {data.lines.length === 0 && <p className="py-7 text-center text-sm text-slate-500" data-testid={testId('empty-statement')}>No client commission lines are recorded for this payout.</p>}
    </div>
    {adjustmentLines.length > 0 && <div className="mt-6">
      <h4 className="mb-2 text-sm font-semibold text-slate-900">Payout adjustments</h4>
      <div className={print ? '' : 'overflow-x-auto'}>
        <table className={print ? 'payout-print-table' : 'w-full min-w-[500px] text-left text-sm'}>
          <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-4">Type</th><th className="py-2 pr-4">Description</th><th className="py-2 pr-4">Client</th><th className="py-2 text-right">Amount</th></tr></thead>
          <tbody className="divide-y divide-slate-200">{adjustmentLines.map((line, index) => <tr key={`${line.type}-${index}`} data-testid={print ? undefined : `row-statement-adjustment-${id}-${index}`}>
            <td className="py-3 pr-4 capitalize">{line.type.replace(/_/g, ' ')}</td><td className="py-3 pr-4">{line.description}</td><td className="py-3 pr-4">{line.clientName || '—'}</td><td className="py-3 text-right tabular-nums text-red-800">{usd(line.amountUsd)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>}
    <dl className={print ? 'payout-print-totals' : 'ml-auto mt-5 max-w-sm space-y-2 border-t border-slate-200 pt-4 text-sm'}>
      <div className="flex justify-between gap-4"><dt>Qualifying client payments</dt><dd className="tabular-nums">{usd(data.totalClientPaymentUsd)}</dd></div>
      <div className="flex justify-between gap-4"><dt>Total commission</dt><dd className="tabular-nums">{usd(data.totalCommissionUsd)}</dd></div>
      <div className="flex justify-between gap-4"><dt>Adjustments</dt><dd className="tabular-nums">{usd(data.adjustmentsAmount)}</dd></div>
      <div className="flex justify-between gap-4 border-t border-slate-200 pt-3 font-bold text-slate-900"><dt>Net payout</dt><dd className="tabular-nums" data-testid={testId('text-net-payout')}>{usd(data.netPayoutAmount)}</dd></div>
    </dl>
    {data.yearToDatePaidUsd != null && data.yearToDateYear != null && <aside className={print ? 'payout-print-ytd' : 'mt-5 rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm'}>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><strong className="text-teal-950">{data.yearToDateYear} year-to-date paid · 1099 reference</strong><strong className="tabular-nums text-teal-950" data-testid={testId('text-ytd-paid')}>{usd(data.yearToDatePaidUsd)}</strong></div>
      <p className="mt-1 text-xs text-teal-800">Reference only. This is not a tax filing amount; consult your tax records for reporting.</p>
    </aside>}
    {print && <p className="payout-print-footnote">Invoice billing periods are shown in UTC when available. Older records are estimated from their payment month. Client payments are qualifying paid revenue.</p>}
  </div>;
}

export function PayoutStatement({ scope, id }: { scope: 'admin' | 'portal'; id: string }) {
  const statement = usePayoutStatement(scope, id, true);
  const download = useDownloadPayoutStatement(scope, id);
  const { toast } = useToast();
  const [printRoot, setPrintRoot] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = document.createElement('div');
    root.className = 'payout-print-document';
    document.body.appendChild(root);
    setPrintRoot(root);
    const clearPrint = () => root.classList.remove('payout-print-active');
    window.addEventListener('afterprint', clearPrint);
    return () => { window.removeEventListener('afterprint', clearPrint); root.remove(); };
  }, []);

  const handleDownload = async () => {
    try {
      await download.mutateAsync();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Could not download statement', description: (error as Error).message });
    }
  };

  if (statement.isLoading) return <div role="status" className="space-y-3 p-5 animate-pulse" data-testid={`loading-statement-${id}`}>
    <div className="h-4 w-48 rounded bg-slate-200" /><div className="h-9 rounded bg-slate-100" /><div className="h-9 rounded bg-slate-100" />
    <span className="sr-only">Loading statement</span>
  </div>;

  if (statement.isError) return <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" data-testid={`error-statement-${id}`}>
    <AlertCircle className="h-4 w-4" /> {statement.error.message}
    <Button type="button" variant="outline" size="sm" onClick={() => void statement.refetch()} data-testid={`button-retry-statement-${id}`}>Retry</Button>
  </div>;

  const data = statement.data;
  if (!data) return null;
  return <>
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700 sm:p-6" aria-label={`Statement for payout ${id}`} data-testid={`statement-${id}`}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-teal-800">Payout statement</p>
          <h3 className="mt-1 font-semibold text-slate-900">Client commissions</h3>
          <p className="mt-1 text-xs text-slate-500">Invoice billing periods are shown in UTC when available. Older records are estimated from their payment month. Client payments are qualifying paid revenue.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={download.isPending} onClick={handleDownload} data-testid={`button-download-statement-${id}`}>
            <Download className="mr-2 h-4 w-4" />{download.isPending ? 'Downloading…' : 'Download CSV'}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!printRoot} onClick={() => { printRoot?.classList.add('payout-print-active'); window.print(); }} data-testid={`button-print-statement-${id}`}>
            <Printer className="mr-2 h-4 w-4" />Print / Save as PDF
          </Button>
        </div>
      </div>
      <StatementContent data={data} id={id} />
    </section>
    {printRoot && createPortal(<StatementContent data={data} id={id} print />, printRoot)}
  </>;
}