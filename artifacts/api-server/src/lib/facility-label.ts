/**
 * The optional facility label carried on a generation request.
 *
 * Kept in its own module rather than inside routes/generate.ts so it can be
 * tested without loading the Express router, the rate limiter and a database
 * connection — a pure function deserves a test that fails for its own reasons.
 */

/** Longest facility name worth storing. Anything beyond this is not a name. */
export const FACILITY_LABEL_MAX = 200;

/**
 * Pulls an optional facility label off a request body.
 *
 * Read straight off the body rather than through the generated request schema,
 * which strips fields it does not know about — that schema is produced by Orval
 * from the OpenAPI spec, and regenerating it is a separate change. Sanitised
 * here instead, because the value is written to the database: unverified client
 * input, trimmed and capped.
 *
 * Returns null for anything that is not a usable string, so a client sending an
 * object, a number or nothing at all records null rather than failing the
 * generation. This is observability, and it must never be the reason a
 * customer's document does not get written.
 */
export function readFacilityLabel(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = (body as { facilityLabel?: unknown }).facilityLabel;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, FACILITY_LABEL_MAX);
}
