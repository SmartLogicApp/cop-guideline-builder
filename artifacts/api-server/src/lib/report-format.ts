/**
 * Shared shaping for admin reports.
 *
 * Extracted from routes/admin.ts so the affiliate reports produce byte-identical
 * CSV and identical period boundaries. If the two had their own copies, an
 * affiliate report and a client report for "September 2026" could quietly cover
 * different ranges — and the first anyone would know is an affiliate disputing
 * a quarter that does not tie out to the revenue report it was calculated from.
 */

/**
 * Month bounds from a "YYYY-MM" string, defaulting to the current month.
 * `end` is exclusive: queries pair it as gte(start) + lt(end).
 *
 * LOCAL TIME, not UTC — deliberately, because that is what routes/admin.ts has
 * always done and the reports have to reconcile with each other. Changing one
 * of them to UTC in isolation would move month boundaries by the server's
 * offset and make historical reports irreproducible.
 */
export function monthBounds(monthStr?: string): { start: Date; end: Date; label: string } {
  let start: Date;
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split("-").map(Number);
    start = new Date(y!, m! - 1, 1);
  } else {
    const now = new Date();
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  const label = start.toLocaleString("en-US", { month: "long", year: "numeric" });
  return { start, end, label };
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v);
    // A numeric value is already data, not spreadsheet formula source. For all
    // strings (headers included), prefix an apostrophe when Excel/Sheets could
    // interpret leading whitespace followed by =, +, - or @ as a formula.
    if (typeof v !== "number" && /^[\u0000-\u0020\uFEFF]*[=+\-@]/u.test(s)) {
      s = `'${s}`;
    }
    return /[",\r\n]/u.test(s)
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [headers, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
}

/** The one place a CSV response is shaped, so every report downloads the same way. */
export function sendCsv(
  res: { setHeader: (k: string, v: string) => void; send: (body: string) => unknown },
  filename: string,
  csv: string,
): unknown {
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(csv);
}

/** Money as the JSON convention used throughout the admin API. */
export function money(value: number): number {
  return Math.round((Number(value) || 0) * 1e6) / 1e6;
}
