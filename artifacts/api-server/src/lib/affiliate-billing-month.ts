export type AffiliateBillingMonthSource =
  | "invoice_line_period"
  | "invoice_period"
  | "payment_month_fallback";

export type AffiliateBillingMonth = {
  billingMonth: string;
  billingMonthSource: AffiliateBillingMonthSource;
};

function epochMonth(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return null;
  const date = new Date(value * 1000);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 7);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function recurringPeriodStarts(invoice: Record<string, unknown>): number[] {
  const lines = isObject(invoice.lines) && Array.isArray(invoice.lines.data)
    ? invoice.lines.data
    : [];
  const periods = lines.flatMap((rawLine) => {
    if (!isObject(rawLine)) return [];
    const pricing = isObject(rawLine.pricing) ? rawLine.pricing : null;
    const price = isObject(rawLine.price)
      ? rawLine.price
      : pricing && isObject(pricing.price_details)
        ? pricing.price_details
        : null;
    const isRecurring = price?.type === "recurring" || price?.recurring != null;
    const linePeriod = isObject(rawLine.period) ? rawLine.period : null;
    const periodStart = linePeriod?.start;
    return isRecurring && typeof periodStart === "number" && Number.isSafeInteger(periodStart) && periodStart > 0
      ? [periodStart]
      : [];
  });
  return [...new Set(periods)];
}

export function deriveAffiliateBillingMonth(
  invoice: unknown,
  paidAt: Date,
): AffiliateBillingMonth {
  const invoiceRecord = isObject(invoice) ? invoice : {};
  const recurringStarts = recurringPeriodStarts(invoiceRecord);
  if (recurringStarts.length === 1) {
    const billingMonth = epochMonth(recurringStarts[0]);
    if (billingMonth) return { billingMonth, billingMonthSource: "invoice_line_period" };
  }

  const invoicePeriodMonth = epochMonth(invoiceRecord.period_start);
  if (invoicePeriodMonth) {
    return { billingMonth: invoicePeriodMonth, billingMonthSource: "invoice_period" };
  }

  if (!Number.isFinite(paidAt.getTime())) {
    throw new Error("Affiliate billing month could not be determined from the invoice or payment date.");
  }
  return {
    billingMonth: paidAt.toISOString().slice(0, 7),
    billingMonthSource: "payment_month_fallback",
  };
}