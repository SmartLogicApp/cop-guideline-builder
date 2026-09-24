/**
 * Defensive ledger filter shared by quarterly previews and the locked draft
 * transaction. A commission with a legacy payout reference, a prior transfer,
 * or an active claim can never enter a new draft.
 */
export function eligibleQuarterCommission(
  row: {
    id: string;
    amount: number | string | null;
    status: string;
    payoutId: string | null;
    payableAt: Date;
    accruedAt: Date;
  },
  reservedIds: ReadonlySet<string>,
  end: Date,
  now: Date,
  quarterly: boolean,
): boolean {
  return row.status === "payable"
    && row.payoutId === null
    && !reservedIds.has(row.id)
    && (!quarterly || row.payableAt < end)
    && row.payableAt <= now
    && Number.isFinite(Number(row.amount))
    && Math.round(Number(row.amount) * 100) > 0;
}

export function sumCommissionCents(rows: ReadonlyArray<{ amount: number | string | null }>): number {
  return rows.reduce((total, row) => total + Math.round(Number(row.amount) * 100), 0);
}