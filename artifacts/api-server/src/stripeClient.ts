import { ReplitConnectors } from "@replit/connectors-sdk";
import Stripe from "stripe";

type StripeProxyOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: URLSearchParams;
  idempotencyKey?: string;
};

export async function stripeRequest<T>(
  path: string,
  options: StripeProxyOptions = {},
): Promise<T> {
  const testSecret = process.env.STRIPE_TEST_SECRET_KEY?.trim();
  if (testSecret && process.env.NODE_ENV !== "production") {
    const response = await fetch(`https://api.stripe.com${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${testSecret}`,
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

  // Never cache the connector client: its identity tokens may rotate.
  const connectors = new ReplitConnectors();
  const response = await connectors.proxy("stripe", path, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: options.body,
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
      ? process.env.STRIPE_WEBHOOK_SECRET
      : process.env.STRIPE_TEST_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET
  )?.trim();
  if (!webhookSecret) {
    throw new Error(
      process.env.NODE_ENV === "production"
        ? "STRIPE_WEBHOOK_SECRET is not configured."
        : "STRIPE_TEST_WEBHOOK_SECRET is not configured.",
    );
  }
  return webhookSecret;
}

export function getStripeSignatureVerifier(): Stripe {
  // Signature verification is local; outbound API calls always use the connector.
  return new Stripe("sk_test_signature_verification_only", {
    apiVersion: "2026-07-29.dahlia",
  });
}