import type Stripe from "stripe";

/**
 * Accounts v2 recipient/Express accounts have type "none" when represented
 * through Accounts v1, including the snapshot in account.updated events.
 * Verify the authoritative v2 configuration before trusting that shape.
 * The caller must use the Test-only Stripe client and reject live events.
 */
export async function isTestExpressRecipient(stripe: Stripe, account: Stripe.Account): Promise<boolean> {
  if (account.type === "express") return true;
  if (account.type !== "none") return false;
  const v2 = await stripe.v2.core.accounts.retrieve(account.id, { include: ["configuration.recipient"] });
  return !v2.livemode && v2.dashboard === "express" && Boolean(v2.configuration?.recipient);
}