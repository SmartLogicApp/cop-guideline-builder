import { redactSensitiveFinancialData } from "./affiliate-sensitive-boundary.ts";

export type AffiliatePayoutStatementPayout = {
  id: string;
  affiliateId: string;
  affiliateName: string;
  stripeTransferId: string | null;
  payoutPeriodStart: Date | string;
  payoutPeriodEnd: Date | string;
  quarter: string;
  payoutStatus: string;
  currency: string;
  grossCommissionAmount: number | string;
  adjustmentsAmount: number | string;
  netPayoutAmount: number | string;
  createdAt: Date | string;
  paidAt: Date | string | null;
};

export type AffiliatePayoutStatementClaim = {
  commissionAmount: number | string;
  commissionStatus: string;
  qualifyingRevenueUsd: number | string;
  ratePct: number | string;
  accruedAt: Date | string;
  payableAt: Date | string | null;
  billingMonth?: string | null;
  billingMonthSource?: string | null;
  facilityName: string | null;
};

export type AffiliatePayoutStatement = {
  payout: AffiliatePayoutStatementPayout;
  lines: Array<{
    clientName: string;
    billingMonth: string;
    billingMonthSource: "invoice_line_period" | "invoice_period" | "payment_month_fallback";
    clientPaymentUsd: number;
    commissionRatePct: number;
    commissionAmountUsd: number;
    commissionStatus: string;
    holdbackReleaseAt: Date | string | null;
  }>;
  adjustmentLines: Array<{
    type: string;
    reason: string;
    description: string;
    amountUsd: number;
    clientName?: string;
  }>;
  totalClientPaymentUsd: number;
  totalCommissionUsd: number;
  yearToDatePaidUsd: number;
  yearToDateYear: number;
  adjustmentsAmount: number;
  netPayoutAmount: number;
};

export function canAffiliateViewPayoutStatement(
  payoutAffiliateId: string,
  requesterAffiliateId: string,
): boolean {
  return payoutAffiliateId === requesterAffiliateId;
}

export function statementMoney(value: number | string): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) throw new Error("Payout statement contains an invalid monetary amount.");
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function paymentMonthEstimate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Payout statement contains an invalid accrual date.");
  return date.toISOString().slice(0, 7);
}

function billingMonthForClaim(claim: AffiliatePayoutStatementClaim): {
  billingMonth: string;
  billingMonthSource: "invoice_line_period" | "invoice_period" | "payment_month_fallback";
} {
  if (claim.billingMonth == null) {
    return {
      billingMonth: paymentMonthEstimate(claim.accruedAt),
      billingMonthSource: "payment_month_fallback",
    };
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(claim.billingMonth)
      || !["invoice_line_period", "invoice_period", "payment_month_fallback"].includes(claim.billingMonthSource ?? "")) {
    throw new Error("Payout statement contains invalid billing-month provenance.");
  }
  return {
    billingMonth: claim.billingMonth,
    billingMonthSource: claim.billingMonthSource as "invoice_line_period" | "invoice_period" | "payment_month_fallback",
  };
}

export function buildAffiliatePayoutStatement(
  payout: AffiliatePayoutStatementPayout,
  claims: AffiliatePayoutStatementClaim[],
  yearToDate: { paidUsd: number | string; year: number },
): AffiliatePayoutStatement {
  const lines = claims.map((claim) => {
    const billing = billingMonthForClaim(claim);
    return {
      // Build one sanitized representation for both JSON and CSV so the export
      // cannot disclose a legacy facility name that the API response redacts.
      clientName: redactSensitiveFinancialData(claim.facilityName?.trim() || "Client"),
      billingMonth: billing.billingMonth,
      billingMonthSource: billing.billingMonthSource,
      clientPaymentUsd: statementMoney(claim.qualifyingRevenueUsd),
      commissionRatePct: Number(claim.ratePct),
      // Use the snapshotted payout claim amount, not a rate recomputed on read.
      commissionAmountUsd: statementMoney(claim.commissionAmount),
      commissionStatus: claim.commissionStatus,
      holdbackReleaseAt: claim.payableAt,
    };
  });
  const totalClientPaymentUsd = statementMoney(lines.reduce((sum, line) => sum + line.clientPaymentUsd, 0));
  const totalCommissionUsd = statementMoney(lines.reduce((sum, line) => sum + line.commissionAmountUsd, 0));
  const grossCommissionAmount = statementMoney(payout.grossCommissionAmount);
  if (totalCommissionUsd !== grossCommissionAmount) {
    throw new Error("Payout statement claim total does not match the payout's recorded gross amount.");
  }
  const adjustmentsAmount = statementMoney(payout.adjustmentsAmount);
  const netPayoutAmount = statementMoney(payout.netPayoutAmount);
  const yearToDatePaidUsd = statementMoney(yearToDate.paidUsd);
  const adjustmentLines = adjustmentsAmount < 0
    ? [{
        type: "general_adjustment",
        reason: "Recorded payout adjustment",
        description: "The payout record contains a negative adjustment. No durable line-level source links this amount to a specific refund or dispute.",
        amountUsd: adjustmentsAmount,
      }]
    : [];
  if (adjustmentsAmount > 0) {
    throw new Error("Payout statement cannot represent a positive adjustment as a negative adjustment line.");
  }
  if (statementMoney(grossCommissionAmount + adjustmentsAmount) !== netPayoutAmount) {
    throw new Error("Payout statement adjustments do not match the recorded net payout amount.");
  }
  return {
    payout: {
      ...payout,
      // CSV bypasses response redaction, so sanitize every displayed name here.
      affiliateName: redactSensitiveFinancialData(payout.affiliateName),
    },
    lines,
    adjustmentLines,
    totalClientPaymentUsd,
    totalCommissionUsd,
    yearToDatePaidUsd,
    yearToDateYear: yearToDate.year,
    adjustmentsAmount,
    netPayoutAmount,
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? "");
  // Prevent spreadsheet formulas when client/business names are opened in a
  // spreadsheet application. Whitespace and BOM are commonly used to bypass
  // naive formula checks.
  const numericValue = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text);
  if (!numericValue && /^[\s\uFEFF]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function usd(value: number): string {
  return value.toFixed(2);
}

export function affiliatePayoutStatementCsv(statement: AffiliatePayoutStatement): string {
  const rows: unknown[][] = [[
    "Record Type",
    "Payout ID",
    "Affiliate ID",
    "Affiliate Name",
    "Stripe Transfer ID",
    "Quarter",
    "Payout Status",
    "Paid At",
    "Year-to-date Year",
    "Year-to-date Paid (USD)",
    "Client",
    "Billing Month (UTC)",
    "Billing Month Source",
    "Holdback Release At",
    "Client Payment (USD)",
    "Commission Rate (%)",
    "Commission Amount (USD)",
    "Commission Status",
    "Adjustment Type",
    "Adjustment Reason",
    "Adjustment Description",
    "Adjustment Amount (USD)",
  ]];
  const metadata = [
    statement.payout.id,
    statement.payout.affiliateId,
    statement.payout.affiliateName,
    statement.payout.stripeTransferId ?? "",
    statement.payout.quarter,
    statement.payout.payoutStatus,
    statement.payout.paidAt instanceof Date
      ? statement.payout.paidAt.toISOString()
      : statement.payout.paidAt ?? "",
    statement.yearToDateYear,
    usd(statement.yearToDatePaidUsd),
  ];
  rows.push(["PAYOUT", ...metadata, "", "", "", "", "", "", "", "", "", "", "", ""]);
  for (const line of statement.lines) {
    rows.push([
      "COMMISSION",
      ...metadata,
      line.clientName,
      line.billingMonth,
      line.billingMonthSource,
      line.holdbackReleaseAt instanceof Date ? line.holdbackReleaseAt.toISOString() : line.holdbackReleaseAt ?? "",
      usd(line.clientPaymentUsd),
      line.commissionRatePct,
      usd(line.commissionAmountUsd),
      line.commissionStatus,
      "",
      "",
      "",
      "",
    ]);
  }
  for (const adjustment of statement.adjustmentLines) {
    rows.push([
      "ADJUSTMENT",
      ...metadata,
      adjustment.clientName ?? "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      adjustment.type,
      adjustment.reason,
      adjustment.description,
      usd(adjustment.amountUsd),
    ]);
  }
  rows.push([
    "TOTAL CLIENT PAYMENT", ...metadata,
    "", "", "", "", usd(statement.totalClientPaymentUsd), "", "", "", "", "", "", "",
  ]);
  rows.push([
    "TOTAL COMMISSION", ...metadata,
    "", "", "", "", "", "", usd(statement.totalCommissionUsd), "", "", "", "", "",
  ]);
  rows.push([
    "PAYOUT ADJUSTMENTS", ...metadata,
    "", "", "", "", "", "", "", "", "", "", "", usd(statement.adjustmentsAmount),
  ]);
  rows.push([
    "NET PAYOUT", ...metadata,
    "", "", "", "", "", "", "", "", "", "", "", usd(statement.netPayoutAmount),
  ]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}