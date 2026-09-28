export type InvoiceRiskDisposition =
  | "clear"
  | "partial_refund_review"
  | "dispute_open"
  | "full_refund";

export function invoiceRiskDisposition(input: {
  chargeAmountMinor: number;
  cumulativeRefundedMinor: number;
  disputeStatus: string | null;
}): InvoiceRiskDisposition {
  if (
    input.cumulativeRefundedMinor >= input.chargeAmountMinor ||
    input.disputeStatus === "lost"
  ) return "full_refund";
  if (input.disputeStatus === "open") return "dispute_open";
  if (input.cumulativeRefundedMinor > 0) return "partial_refund_review";
  return "clear";
}
