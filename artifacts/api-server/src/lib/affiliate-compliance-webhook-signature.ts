import Stripe from "stripe";

const signatureVerifier = new Stripe("sk_test_signature_verification_only", { apiVersion: "2026-07-29.dahlia" });

export function verifyAffiliateConnectWebhook(rawBody: Buffer, signature: string): Stripe.Event {
  const live = process.env.NODE_ENV === "production";
  const secret = (live
    ? process.env.STRIPE_CONNECT_LIVE_WEBHOOK_SECRET
    : process.env.STRIPE_CONNECT_TEST_WEBHOOK_SECRET)?.trim();
  if (!secret) {
    throw new Error(live
      ? "Connect live webhook secret is not configured."
      : "Connect test webhook secret is not configured.");
  }
  return signatureVerifier.webhooks.constructEvent(rawBody, signature, secret);
}