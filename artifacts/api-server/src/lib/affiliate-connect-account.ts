import type Stripe from "stripe";

export interface ExpressRecipientVerification {
  valid: boolean;
  transferCapabilityActive: boolean;
}

/**
 * Accounts v2 recipient/Express accounts can appear as type "none" through
 * Accounts v1. Confirm mode, Express dashboard, and the authoritative v2
 * recipient transfer capability before using the account for payouts.
 */
export async function verifyExpressRecipient(
  stripe: Stripe,
  account: Stripe.Account,
  expectedLivemode: boolean,
): Promise<ExpressRecipientVerification> {
  if (account.type !== "express" && account.type !== "none") {
    return { valid: false, transferCapabilityActive: false };
  }
  const v2 = await stripe.v2.core.accounts.retrieve(account.id, { include: ["configuration.recipient"] });
  const recipient = v2.configuration?.recipient;
  const transferCapability = recipient?.capabilities?.stripe_balance?.stripe_transfers;
  const transferCapabilityActive = transferCapability?.status === "active"
    && Array.isArray(transferCapability.status_details)
    && transferCapability.status_details.length === 0;
  return {
    valid: v2.livemode === expectedLivemode && v2.dashboard === "express" && recipient?.applied === true,
    transferCapabilityActive,
  };
}