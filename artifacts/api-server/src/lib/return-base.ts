import type { Request } from "express";

/**
 * The origin to build links back to this application with.
 *
 * WHY THIS EXISTS: `Host` and `X-Forwarded-Host` are attacker-controlled. A
 * request can claim any host it likes, and whatever we build from it ends up
 * in a Stripe return URL or inside an email we send to our own administrators.
 * An unguarded version turns a report email into a credible phishing link:
 * right sender, right wording, wrong host.
 *
 * Two defences, in order:
 *  1. PUBLIC_APP_URL wins whenever it is set. A configured origin cannot be
 *     influenced by a request at all, so prefer it.
 *  2. Otherwise the forwarded host must look like a hostname and nothing else.
 *     The pattern permits letters, digits, dots, hyphens and an optional port —
 *     which excludes the slashes, @ and whitespace needed to redirect the URL
 *     somewhere other than where it appears to go.
 *
 * `split(",")[0]` matters: proxies append, so these headers arrive as lists.
 * Taking the whole string would smuggle a second host into the URL.
 *
 * This was extracted from routes/billing.ts, where the guard already existed,
 * because routes/admin.ts had grown its own unguarded copy. One implementation
 * so the next caller cannot get a weaker one.
 */
export function getReturnBase(req: Request): string {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const protocol = String(req.headers["x-forwarded-proto"] ?? req.protocol ?? "https")
    .split(",")[0]!
    .trim();
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "")
    .split(",")[0]!
    .trim();

  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    throw new Error("Unable to determine a safe return URL.");
  }
  if (protocol !== "http" && protocol !== "https") {
    throw new Error("Unable to determine a safe return URL.");
  }
  return `${protocol}://${host}`;
}
