import type Stripe from "stripe";
import { db, accounts } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getStripeSignatureVerifier,
  getStripeWebhookSecret,
  stripeRequest,
} from "./stripeClient";
import { logger } from "./lib/logger.js";
import {
  accrueCommissionForPayment,
  reverseCommissionForInvoice,
} from "./lib/affiliate-accrual.js";

type SubscriptionLike = Stripe.Subscription & {
  current_period_start?: number;
  current_period_end?: number;
  items: Stripe.ApiList<Stripe.SubscriptionItem & {
    current_period_start?: number;
    current_period_end?: number;
  }>;
};

function timestamp(seconds: number | null | undefined) {
  return seconds ? new Date(seconds * 1000) : null;
}

/**
 * The part of an invoice that is NOT subscription revenue (§7.1 excludes
 * professional services, implementation and consulting fees).
 *
 * Identified by Stripe's own price type rather than by reading descriptions: a
 * recurring price is subscription revenue, anything one-off is not. Guessing
 * from a line's wording would make the commission base depend on how an
 * invoice happened to be labelled.
 *
 * Returns minor units, matching every other amount on a Stripe invoice.
 */
function nonSubscriptionAmount(invoice: Stripe.Invoice): number {
  const lines = invoice.lines?.data ?? [];
  return lines.reduce((sum, line) => {
    const price = (line as any).price ?? (line as any).pricing?.price_details;
    const isRecurring = price?.type === "recurring" || price?.recurring != null;
    return isRecurring ? sum : sum + (line.amount ?? 0);
  }, 0);
}

/**
 * Bridge from a paid Stripe invoice to the affiliate accrual.
 *
 * The account is found by Stripe customer ID, which is the only link that
 * survives regardless of how the subscription was created.
 */
async function accrueCommissionFromInvoice(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId || !invoice.id) return;
  if (!invoice.amount_paid || invoice.amount_paid <= 0) return;

  const [account] = await db.select({ id: accounts.id })
    .from(accounts).where(eq(accounts.stripeCustomerId, customerId)).limit(1);
  if (!account) return;

  const outcome = await accrueCommissionForPayment({
    accountId: account.id,
    stripeInvoiceId: invoice.id,
    paidAt: timestamp(invoice.status_transitions?.paid_at) ?? new Date(),
    invoice: {
      amountPaid: invoice.amount_paid,
      tax: (invoice as any).tax ?? (invoice as any).total_taxes?.reduce(
        (sum: number, t: any) => sum + (t.amount ?? 0), 0) ?? 0,
      total: invoice.total,
      currency: invoice.currency,
      nonSubscriptionAmount: nonSubscriptionAmount(invoice),
    },
  });

  // Logged either way. An affiliate asking "why was this invoice not credited
  // to me?" is answerable from the logs rather than from reasoning about it.
  if (outcome.accrued) {
    console.log(`[affiliate] accrued $${outcome.commissionUsd} at ${outcome.ratePct}% on invoice ${invoice.id}`);
  } else if (outcome.reason === "out-of-order-payment") {
    logger.warn(
      { invoiceId: invoice.id },
      "Out-of-order affiliate invoice needs manual reconciliation; no automatic recovery is configured.",
    );
  } else if (outcome.reason !== "no-referral-code") {
    console.log(`[affiliate] no accrual on invoice ${invoice.id}: ${outcome.reason}`);
  }
}

async function syncSubscription(subscription: SubscriptionLike) {
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
  const accountId = subscription.metadata?.accountId;
  const firstItem = subscription.items.data[0];

  await db.update(accounts).set({
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: firstItem?.price.id ?? null,
    subscriptionStatus: subscription.status,
    subscriptionCurrentPeriodStart: timestamp(
      firstItem?.current_period_start ?? subscription.current_period_start,
    ),
    subscriptionCurrentPeriodEnd: timestamp(
      firstItem?.current_period_end ?? subscription.current_period_end,
    ),
    subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end,
    subscriptionCanceledAt: timestamp(subscription.canceled_at),
    // Mirror Stripe's trial end onto the account so one column answers
    // "when does this trial end" whether the trial was created locally at
    // signup or by Stripe at checkout. Only written when Stripe reports one,
    // so an account's original signup trial date is never blanked.
    ...(subscription.trial_end
      ? { trialEndsAt: timestamp(subscription.trial_end) }
      : {}),
    updatedAt: new Date(),
  }).where(accountId
    ? eq(accounts.id, accountId)
    : eq(accounts.stripeCustomerId, customerId));
}

async function retrieveSubscription(
  subscriptionRef: string | Stripe.Subscription | null | undefined,
) {
  if (!subscriptionRef) return null;
  const id = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef.id;
  return await stripeRequest<SubscriptionLike>(`/v1/subscriptions/${encodeURIComponent(id)}`);
}

export async function syncStripeSubscriptionById(subscriptionId: string) {
  const subscription = await retrieveSubscription(subscriptionId);
  if (!subscription) throw new Error("Stripe subscription was not found.");
  await syncSubscription(subscription);
  return subscription;
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'Payload must be a Buffer — ensure webhook route is registered BEFORE express.json().',
      );
    }
    const stripe = getStripeSignatureVerifier();
    const webhookSecret = getStripeWebhookSecret();
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const subscription = await retrieveSubscription(session.subscription);
        if (subscription) await syncSubscription(subscription);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        // Retrieve current state so duplicate or out-of-order events converge.
        const subscription = await retrieveSubscription(event.data.object as Stripe.Subscription);
        if (subscription) await syncSubscription(subscription);
        break;
      }
      case "invoice.payment_succeeded": {
        // This event has no other side effects in this handler. Accrual failures
        // must reach the webhook route so Stripe retries; the invoice ID's
        // unique ledger constraint makes a replay idempotent.
        await accrueCommissionFromInvoice(event.data.object as Stripe.Invoice);
        break;
      }
      case "charge.refunded":
      case "charge.dispute.created": {
        // §25 — the customer's money went back, so the commission on it is
        // cancelled (or deducted from a future payout if already paid).
        try {
          const charge = event.data.object as Stripe.Charge & { invoice?: string | { id?: string } | null };
          const invoiceId = typeof charge.invoice === "string" ? charge.invoice : charge.invoice?.id;
          if (invoiceId) {
            await reverseCommissionForInvoice(
              invoiceId,
              event.type === "charge.refunded" ? "Customer payment refunded" : "Customer chargeback",
            );
          }
        } catch (error) {
          console.error("[affiliate] reversal failed for", event.type, error);
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | Stripe.Subscription | null;
          parent?: { subscription_details?: { subscription?: string | Stripe.Subscription | null } };
        };
        const subscription = await retrieveSubscription(
          invoice.subscription ?? invoice.parent?.subscription_details?.subscription,
        );
        if (subscription) await syncSubscription(subscription);
        break;
      }
      default:
        break;
    }
  }
}
