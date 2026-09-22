import Stripe from "stripe";

type StripeRequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: URLSearchParams;
  idempotencyKey?: string;
};

/**
 * The secret key for the current environment, or null when it is not set.
 *
 * Exported so callers can ask "is Stripe usable?" before trying to use it.
 * routes/billing.ts wants to answer a missing key with a 503 the customer can
 * understand rather than a 500 thrown from inside a request it already began.
 */
export function getStripeSecretKey(): string | null {
  const secret = (
    process.env.NODE_ENV === "production"
      ? process.env.STRIPE_LIVE_SECRET_KEY
      : process.env.STRIPE_TEST_SECRET_KEY
  )?.trim();
  return secret ? secret : null;
}

export function isStripeConfigured(): boolean {
  return getStripeSecretKey() !== null;
}

export async function stripeRequest<T>(
  path: string,
  options: StripeRequestOptions = {},
): Promise<T> {
  const directSecret = getStripeSecretKey();
  if (!directSecret) {
    throw new Error(
      process.env.NODE_ENV === "production"
        ? "STRIPE_LIVE_SECRET_KEY is not configured."
        : "STRIPE_TEST_SECRET_KEY is not configured.",
    );
  }

  const response = await fetch(`https://api.stripe.com${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${directSecret}`,
      ...(options.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: options.body?.toString(),
  });
  const payload = await response.json() as T & {
    error?: { message?: string; code?: string };
  };
  if (!response.ok) {
    const error = new Error(payload.error?.message ?? `Stripe request failed (${response.status}).`);
    Object.assign(error, { status: response.status, stripeCode: payload.error?.code });
    throw error;
  }
  return payload;
}

export function getConfiguredStripePriceId(): string {
  const priceId = process.env.STRIPE_PRICE_ID?.trim();
  if (!priceId) throw new Error("STRIPE_PRICE_ID is not configured.");
  return priceId;
}

export function getStripeWebhookSecret(): string {
  const webhookSecret = (
    process.env.NODE_ENV === "production"
      ? process.env.STRIPE_LIVE_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET
      : process.env.STRIPE_TEST_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET
  )?.trim();
  if (!webhookSecret) {
    throw new Error(
      process.env.NODE_ENV === "production"
        ? "STRIPE_LIVE_WEBHOOK_SECRET is not configured."
        : "STRIPE_TEST_WEBHOOK_SECRET is not configured.",
    );
  }
  return webhookSecret;
}

export function getStripeSignatureVerifier(): Stripe {
  // Signature verification is local; outbound API calls use the environment-specific key.
  return new Stripe("sk_test_signature_verification_only", {
    apiVersion: "2026-07-29.dahlia",
  });
}