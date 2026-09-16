import type Stripe from "stripe";
import { db, accounts } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getStripeSignatureVerifier,
  getStripeWebhookSecret,
  stripeRequest,
} from "./stripeClient";

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
