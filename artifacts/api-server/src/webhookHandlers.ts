import type Stripe from "stripe";
import { db, accounts } from "@workspace/db";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import {
  getStripeSignatureVerifier,
  getStripeWebhookSecret,
  stripeRequest,
} from "./stripeClient";
import { logger } from "./lib/logger.js";
import {
  accrueCommissionForPayment,
} from "./lib/affiliate-accrual.js";
import { deriveAffiliateBillingMonth } from "./lib/affiliate-billing-month.js";
import {
  recordAffiliateInvoiceRisk,
  resolveInvoiceRiskAttribution,
  type StripeRiskEventType,
} from "./lib/affiliate-payment-risk.js";
import {
  isAuthorizedPostRemovalCheckout,
  reconcileStripeSubscriptionSet,
} from "./lib/subscription-lifecycle-rules.js";
import { resolveFirstDirectSetupTrialEnd } from "./lib/payment-config.js";

type SubscriptionLike = Stripe.Subscription & {
  current_period_start?: number;
  current_period_end?: number;
  items: Stripe.ApiList<Stripe.SubscriptionItem & {
    current_period_start?: number;
    current_period_end?: number;
  }>;
};

type InvoiceWithSubscription = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
  parent?: {
    subscription_details?: {
      subscription?: string | Stripe.Subscription | null;
    };
  };
};

export function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subscription = (invoice as InvoiceWithSubscription).subscription ??
    (invoice as InvoiceWithSubscription).parent?.subscription_details?.subscription;
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
}

function timestamp(seconds: number | null | undefined) {
  return seconds ? new Date(seconds * 1000) : null;
}

type StripeIdReference = string | { id: string } | null | undefined;
type ChargeRiskSnapshot = {
  id: string;
  amount: number;
  amount_refunded: number;
  customer?: StripeIdReference;
  invoice?: StripeIdReference;
  payment_intent?: StripeIdReference;
};
type PaymentIntentRiskSnapshot = {
  id: string;
  customer?: StripeIdReference;
  invoice?: StripeIdReference;
};
type InvoiceRiskSnapshot = {
  id: string;
  customer?: StripeIdReference;
};

function stripeId(value: StripeIdReference): string | null {
  if (typeof value === "string") return value;
  return value && typeof value.id === "string" ? value.id : null;
}

async function processInvoiceRiskEvent(input: {
  event: Stripe.Event;
  eventType: StripeRiskEventType;
  eventObject: Stripe.Charge | Stripe.Dispute;
}): Promise<void> {
  const event = input.event;
  const dispute = input.eventObject as Stripe.Dispute & {
    charge?: StripeIdReference;
    payment_intent?: StripeIdReference;
  };
  const chargeEvent = input.eventObject as Stripe.Charge & {
    invoice?: StripeIdReference;
    payment_intent?: StripeIdReference;
  };
  const eventChargeId = input.eventType === "charge.refunded"
    ? chargeEvent.id
    : stripeId(dispute.charge);
  let paymentIntentId = input.eventType === "charge.refunded"
    ? stripeId(chargeEvent.payment_intent)
    : stripeId(dispute.payment_intent);

  let charge: ChargeRiskSnapshot | null = eventChargeId
    ? await stripeRequest<ChargeRiskSnapshot>(
      `/v1/charges/${encodeURIComponent(eventChargeId)}`,
    )
    : null;
  paymentIntentId ??= stripeId(charge?.payment_intent);
  let paymentIntent: PaymentIntentRiskSnapshot | null = null;
  let invoiceId = stripeId(charge?.invoice) ??
    (input.eventType === "charge.refunded" ? stripeId(chargeEvent.invoice) : null);
  if (!invoiceId && paymentIntentId) {
    paymentIntent = await stripeRequest<PaymentIntentRiskSnapshot>(
      `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`,
    );
    invoiceId = stripeId(paymentIntent.invoice);
  }
  if (!invoiceId) {
    throw new Error(
      `Affiliate payment-risk mapping failed: ${input.eventType} event ${event.id} has no resolvable invoice.`,
    );
  }

  const invoice = await stripeRequest<InvoiceRiskSnapshot>(
    `/v1/invoices/${encodeURIComponent(invoiceId)}`,
  );
  if (invoice.id !== invoiceId) {
    throw new Error(`Affiliate payment-risk mapping failed: Stripe returned a different invoice for ${invoiceId}.`);
  }
  const customerId = stripeId(invoice.customer) ??
    stripeId(charge?.customer) ??
    stripeId(paymentIntent?.customer);
  if (!customerId) {
    throw new Error(`Affiliate payment-risk mapping failed: invoice ${invoiceId} has no Stripe customer.`);
  }
  if (
    (stripeId(charge?.customer) && stripeId(charge?.customer) !== customerId) ||
    (stripeId(paymentIntent?.customer) && stripeId(paymentIntent?.customer) !== customerId)
  ) {
    throw new Error(`Affiliate payment-risk mapping failed: invoice ${invoiceId} does not match its charge customer.`);
  }
  if (charge && stripeId(charge.invoice) && stripeId(charge.invoice) !== invoiceId) {
    throw new Error(`Affiliate payment-risk mapping failed: charge ${charge.id} refers to a different invoice.`);
  }
  if (paymentIntent && stripeId(paymentIntent.invoice) && stripeId(paymentIntent.invoice) !== invoiceId) {
    throw new Error(`Affiliate payment-risk mapping failed: payment intent ${paymentIntent.id} refers to a different invoice.`);
  }
  if (!charge) {
    if (!paymentIntentId) {
      throw new Error(`Affiliate payment-risk mapping failed: invoice ${invoiceId} has no charge or payment intent.`);
    }
    const paymentIntentForCharge = paymentIntent ??
      await stripeRequest<PaymentIntentRiskSnapshot>(
        `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`,
      );
    const latestChargeId = stripeId(
      (paymentIntentForCharge as PaymentIntentRiskSnapshot & { latest_charge?: StripeIdReference }).latest_charge,
    );
    if (!latestChargeId) {
      throw new Error(`Affiliate payment-risk mapping failed: payment intent ${paymentIntentId} has no charge.`);
    }
    charge = await stripeRequest<ChargeRiskSnapshot>(
      `/v1/charges/${encodeURIComponent(latestChargeId)}`,
    );
  }
  const retrievedChargeInvoiceId = stripeId(charge.invoice);
  if (retrievedChargeInvoiceId && retrievedChargeInvoiceId !== invoiceId) {
    throw new Error(`Affiliate payment-risk mapping failed: charge ${charge.id} refers to a different invoice.`);
  }
  const retrievedChargeCustomerId = stripeId(charge.customer);
  if (retrievedChargeCustomerId && retrievedChargeCustomerId !== customerId) {
    throw new Error(`Affiliate payment-risk mapping failed: charge ${charge.id} refers to a different customer.`);
  }
  const retrievedPaymentIntentId = stripeId(charge.payment_intent);
  if (paymentIntentId && retrievedPaymentIntentId && retrievedPaymentIntentId !== paymentIntentId) {
    throw new Error(`Affiliate payment-risk mapping failed: charge ${charge.id} refers to a different payment intent.`);
  }
  paymentIntentId ??= retrievedPaymentIntentId;
  if (!Number.isSafeInteger(charge.amount) || charge.amount <= 0) {
    throw new Error(`Affiliate payment-risk processing failed: charge ${charge.id} has an invalid amount.`);
  }
  if (!Number.isSafeInteger(charge.amount_refunded) || charge.amount_refunded < 0) {
    throw new Error(`Affiliate payment-risk processing failed: charge ${charge.id} has an invalid refund amount.`);
  }
  const disputeStatus = input.eventType === "charge.refunded"
    ? "none"
    : input.eventType === "charge.dispute.created"
      ? "open"
      : dispute.status === "won"
        ? "won"
        : dispute.status === "lost"
          ? "lost"
          : "open";
  const attribution = await resolveInvoiceRiskAttribution(customerId);
  await recordAffiliateInvoiceRisk({
    stripeInvoiceId: invoiceId,
    accountId: attribution.accountId,
    affiliateId: attribution.affiliateId,
    stripeChargeId: charge.id,
    stripePaymentIntentId: paymentIntentId,
    chargeAmountMinor: charge.amount,
    cumulativeRefundedMinor: charge.amount_refunded,
    stripeEventId: event.id,
    eventType: input.eventType,
    eventCreatedAt: new Date(event.created * 1000),
    disputeId: input.eventType === "charge.refunded" ? null : dispute.id,
    disputeStatus,
  });
}

const TERMINAL_STRIPE_STATUSES = new Set(["canceled", "incomplete_expired"]);

/**
 * Cancel without refunding. A prior DELETE may already have succeeded while
 * its response was lost, so re-read Stripe before deciding whether it failed.
 */
async function cancelStripeSubscriptionIfNeeded(subscriptionId: string): Promise<void> {
  let current = await stripeRequest<{ status: string }>(
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
  if (TERMINAL_STRIPE_STATUSES.has(current.status)) return;
  try {
    await stripeRequest(
      `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { method: "DELETE" },
    );
  } catch (error) {
    current = await stripeRequest<{ status: string }>(
      `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
    if (TERMINAL_STRIPE_STATUSES.has(current.status)) return;
    throw error;
  }
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

  const paidAt = timestamp(invoice.status_transitions?.paid_at) ?? new Date();
  const billingMonth = deriveAffiliateBillingMonth(invoice, paidAt);
  const outcome = await accrueCommissionForPayment({
    accountId: account.id,
    stripeInvoiceId: invoice.id,
    paidAt,
    billingMonth,
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
  const outcome = await db.transaction(async (tx) => {
    const [account] = await tx.select({
      id: accounts.id,
      stripeCustomerId: accounts.stripeCustomerId,
      stripeSubscriptionId: accounts.stripeSubscriptionId,
      subscriptionStatus: accounts.subscriptionStatus,
      subscriptionCanceledAt: accounts.subscriptionCanceledAt,
    }).from(accounts).where(
      accountId ? eq(accounts.id, accountId) : eq(accounts.stripeCustomerId, customerId),
    ).for("update").limit(1);
    if (!account || account.stripeCustomerId !== customerId) return { kind: "ignored" as const };

    const authorizedPostRemovalCheckout = isAuthorizedPostRemovalCheckout({
      subscriptionStatus: account.subscriptionStatus,
      removedAt: account.subscriptionCanceledAt,
      metadata: subscription.metadata,
      checkoutAuthenticatedAtMilliseconds: Number(
        subscription.metadata?.authenticatedCheckoutAt,
      ),
    });
    if (account.subscriptionStatus === "removed" && !authorizedPostRemovalCheckout) {
      return { kind: "unauthorized-after-removal" as const };
    }

    const history = await listCustomerSubscriptions(customerId);
    let eligibleHistory = history;
    if (account.subscriptionStatus === "removed") {
      eligibleHistory = history.filter((candidate) =>
        isAuthorizedPostRemovalCheckout({
          subscriptionStatus: account.subscriptionStatus,
          removedAt: account.subscriptionCanceledAt,
          metadata: candidate.metadata,
          checkoutAuthenticatedAtMilliseconds: Number(
            candidate.metadata?.authenticatedCheckoutAt,
          ),
        })
      );
      for (const unauthorizedSubscription of history) {
        if (
          !eligibleHistory.some((candidate) => candidate.id === unauthorizedSubscription.id) &&
          !["canceled", "incomplete_expired"].includes(unauthorizedSubscription.status)
        ) {
          await cancelStripeSubscriptionIfNeeded(unauthorizedSubscription.id);
        }
      }
      if (!eligibleHistory.some((candidate) => candidate.id === subscription.id)) {
        return { kind: "unauthorized-after-removal" as const };
      }
    }
    const { primary, duplicates } = reconcileStripeSubscriptionSet(
      eligibleHistory,
      account.stripeSubscriptionId,
    );
    if (!primary) return { kind: "ignored" as const };
    for (const duplicate of duplicates) {
      await cancelStripeSubscriptionIfNeeded(duplicate.id);
    }

    const chosen = (primary.id === subscription.id ? subscription : primary) as SubscriptionLike;
    const firstItem = chosen.items.data[0];
    const periodEnd = firstItem?.current_period_end ?? chosen.current_period_end;
    // Customer Portal may set cancel_at to the trial/period end without setting
    // cancel_at_period_end. Both represent a scheduled loss of access.
    const cancelsByPeriodEnd = chosen.cancel_at != null &&
      periodEnd != null && chosen.cancel_at <= periodEnd;
    await tx.update(accounts).set({
      stripeCustomerId: customerId,
      stripeSubscriptionId: chosen.id,
      stripePriceId: firstItem?.price.id ?? null,
      subscriptionStatus: chosen.status,
      subscriptionCurrentPeriodStart: timestamp(
        firstItem?.current_period_start ?? chosen.current_period_start,
      ),
      subscriptionCurrentPeriodEnd: timestamp(periodEnd),
      subscriptionCancelAtPeriodEnd: chosen.cancel_at_period_end || cancelsByPeriodEnd,
      subscriptionCanceledAt: timestamp(chosen.canceled_at),
      ...(chosen.trial_end
        ? { trialEndsAt: timestamp(chosen.trial_end) }
        : {}),
      updatedAt: new Date(),
    }).where(eq(accounts.id, account.id));
    return {
      kind: "synchronized" as const,
      subscriptionId: chosen.id,
      unauthorizedAfterRemoval: false,
    };
  });

  if (outcome.kind === "unauthorized-after-removal") {
    await cancelStripeSubscriptionIfNeeded(subscription.id);
  }
}

async function retrieveSubscription(
  subscriptionRef: string | Stripe.Subscription | null | undefined,
) {
  if (!subscriptionRef) return null;
  const id = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef.id;
  return await stripeRequest<SubscriptionLike>(`/v1/subscriptions/${encodeURIComponent(id)}`);
}

const LOCAL_TRIAL_SETUP_POLICY = "local-trial-card-setup-v1";

type SetupCheckoutSession = {
  id: string;
  created: number;
  mode: string | null;
  status: string | null;
  client_reference_id: string | null;
  customer: string | { id: string } | null;
  setup_intent: string | { id: string } | null;
  metadata: Record<string, string> | null;
};

type SubscriptionHistoryItem = SubscriptionLike & {
  id: string;
  status: string;
  created: number;
};

async function listCustomerSubscriptions(customerId: string): Promise<SubscriptionHistoryItem[]> {
  const all: SubscriptionHistoryItem[] = [];
  const seen = new Set<string>();
  let startingAfter: string | undefined;
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const params = new URLSearchParams({ customer: customerId, status: "all", limit: "100" });
    if (startingAfter) params.set("starting_after", startingAfter);
    const page = await stripeRequest<{
      data: SubscriptionHistoryItem[];
      has_more: boolean;
    }>(`/v1/subscriptions?${params.toString()}`);
    if (!page || !Array.isArray(page.data) || typeof page.has_more !== "boolean") {
      throw new Error("Stripe returned an invalid setup-checkout subscription history page.");
    }
    for (const subscription of page.data) {
      if (
        !subscription?.id ||
        !subscription.status ||
        seen.has(subscription.id)
      ) {
        throw new Error("Stripe returned incomplete setup-checkout subscription history.");
      }
      seen.add(subscription.id);
      all.push(subscription);
    }
    if (!page.has_more) return all;
    const cursor = page.data.at(-1)?.id;
    if (!cursor || cursor === startingAfter) {
      throw new Error("Stripe setup-checkout subscription history pagination did not advance.");
    }
    startingAfter = cursor;
  }
  throw new Error("Stripe setup-checkout history exceeded its pagination safety limit.");
}

async function expireOpenCheckoutSessionsForCustomer(customerId: string): Promise<void> {
  const seen = new Set<string>();
  let startingAfter: string | undefined;
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const params = new URLSearchParams({ customer: customerId, status: "open", limit: "100" });
    if (startingAfter) params.set("starting_after", startingAfter);
    const page = await stripeRequest<{
      data: { id: string; status: string }[];
      has_more: boolean;
    }>(`/v1/checkout/sessions?${params.toString()}`);
    if (!page || !Array.isArray(page.data) || typeof page.has_more !== "boolean") {
      throw new Error("Stripe returned an invalid open Checkout session page.");
    }
    for (const session of page.data) {
      if (!session?.id || session.status !== "open" || seen.has(session.id)) {
        throw new Error("Stripe returned incomplete or repeated open Checkout session data.");
      }
      seen.add(session.id);
      await stripeRequest(
        `/v1/checkout/sessions/${encodeURIComponent(session.id)}/expire`,
        { method: "POST" },
      );
    }
    if (!page.has_more) return;
    const cursor = page.data.at(-1)?.id;
    if (!cursor || cursor === startingAfter) {
      throw new Error("Stripe Checkout session pagination did not advance.");
    }
    startingAfter = cursor;
  }
  throw new Error("Stripe open Checkout session history exceeded its pagination safety limit.");
}

async function listCompletedSubscriptionCheckoutIds(customerId: string): Promise<string[]> {
  const subscriptionIds: string[] = [];
  const seen = new Set<string>();
  let startingAfter: string | undefined;
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const params = new URLSearchParams({ customer: customerId, status: "complete", limit: "100" });
    if (startingAfter) params.set("starting_after", startingAfter);
    const page = await stripeRequest<{
      data: {
        id: string;
        status: string;
        mode: string | null;
        subscription: string | { id: string } | null;
      }[];
      has_more: boolean;
    }>(`/v1/checkout/sessions?${params.toString()}`);
    if (!page || !Array.isArray(page.data) || typeof page.has_more !== "boolean") {
      throw new Error("Stripe returned an invalid completed Checkout session page.");
    }
    for (const session of page.data) {
      if (!session?.id || session.status !== "complete" || seen.has(session.id)) {
        throw new Error("Stripe returned incomplete or repeated completed Checkout session data.");
      }
      seen.add(session.id);
      if (session.mode === "subscription" && session.subscription) {
        subscriptionIds.push(typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id);
      }
    }
    if (!page.has_more) return subscriptionIds;
    const cursor = page.data.at(-1)?.id;
    if (!cursor || cursor === startingAfter) {
      throw new Error("Stripe completed Checkout session pagination did not advance.");
    }
    startingAfter = cursor;
  }
  throw new Error("Stripe completed Checkout session history exceeded its pagination safety limit.");
}

/**
 * Complete the second half of a near-expiry, no-card checkout. Setup mode only
 * saves an off-session payment method; this creates the subscription after the
 * user returns, preserving the account's exact local trial end when it remains
 * in the future. A stable idempotency key, Stripe metadata lookup, and account
 * row lock make authenticated confirmation and webhook replay converge.
 */
export async function createSubscriptionFromSetupCheckout(
  session: SetupCheckoutSession,
): Promise<string | null> {
  const accountId = session.metadata?.accountId;
  const expectedCustomerId = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id;
  const setupIntentId = typeof session.setup_intent === "string"
    ? session.setup_intent
    : session.setup_intent?.id;
  if (
    session.mode !== "setup" ||
    session.status !== "complete" ||
    session.metadata?.setupPolicy !== LOCAL_TRIAL_SETUP_POLICY ||
    !accountId ||
    !session.id ||
    !Number.isFinite(session.created) ||
    !session.client_reference_id ||
    session.client_reference_id !== accountId ||
    !expectedCustomerId ||
    !setupIntentId
  ) {
    throw new Error("The completed setup session does not match the local-trial subscription policy.");
  }

  const setupIntent = await stripeRequest<{
    id: string;
    status: string;
    customer: string | { id: string } | null;
    payment_method: string | { id: string } | null;
  }>(`/v1/setup_intents/${encodeURIComponent(setupIntentId)}?expand[]=payment_method`);
  const setupCustomerId = typeof setupIntent.customer === "string"
    ? setupIntent.customer
    : setupIntent.customer?.id;
  const paymentMethodId = typeof setupIntent.payment_method === "string"
    ? setupIntent.payment_method
    : setupIntent.payment_method?.id;
  if (
    setupIntent.status !== "succeeded" ||
    setupCustomerId !== expectedCustomerId ||
    !paymentMethodId
  ) {
    throw new Error("Stripe has not confirmed a reusable payment method for this setup session.");
  }

  const priceId = session.metadata?.priceId;
  if (!priceId) throw new Error("The setup session is missing its subscription price.");

  const accountSubscriptionId = await db.transaction(async (tx) => {
    const [account] = await tx.select().from(accounts)
      .where(eq(accounts.id, accountId)).for("update").limit(1);
    if (!account || account.stripeCustomerId !== expectedCustomerId) {
      throw new Error("The setup session does not belong to this account's Stripe customer.");
    }

    if (
      account.subscriptionStatus === "removed" &&
      !isAuthorizedPostRemovalCheckout({
        subscriptionStatus: account.subscriptionStatus,
        removedAt: account.subscriptionCanceledAt,
        metadata: session.metadata,
        checkoutAuthenticatedAtMilliseconds: Number(
          session.metadata?.authenticatedCheckoutAt,
        ),
      })
    ) return null;

    // A completed setup session is the account's single subscription creation
    // point. Expire any remaining open sessions from either Checkout mode first;
    // if one completed concurrently, Stripe's expire failure aborts creation so
    // the retry can reconcile the subscription that won.
    await expireOpenCheckoutSessionsForCustomer(expectedCustomerId);
    const history = await listCustomerSubscriptions(expectedCustomerId);
    const completedSubscriptionIds = await listCompletedSubscriptionCheckoutIds(expectedCustomerId);
    for (const subscriptionId of completedSubscriptionIds) {
      if (history.some((subscription) => subscription.id === subscriptionId)) continue;
      const completedSubscription = await stripeRequest<SubscriptionHistoryItem>(
        `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
      );
      if (
        !completedSubscription?.id ||
        !completedSubscription.status ||
        !Number.isFinite(completedSubscription.created)
      ) {
        throw new Error("Stripe returned an incomplete subscription from completed Checkout history.");
      }
      history.push(completedSubscription);
    }
    const existingFromThisSetup = history.find((subscription) =>
      subscription.metadata?.setupCheckoutSessionId === session.id
    );
    if (existingFromThisSetup) return existingFromThisSetup.id;

    const activeSubscriptions = history.filter((subscription) =>
      !["canceled", "incomplete_expired"].includes(subscription.status)
    );
    if (activeSubscriptions.length > 0) {
      if (account.subscriptionStatus === "removed") {
        for (const activeSubscription of activeSubscriptions) {
          await cancelStripeSubscriptionIfNeeded(activeSubscription.id);
        }
        return null;
      }
      return reconcileStripeSubscriptionSet(history, account.stripeSubscriptionId).primary?.id ?? null;
    }

    const stripeCustomer = await stripeRequest<{
      id: string;
      test_clock: string | { id: string } | null;
    }>(`/v1/customers/${encodeURIComponent(expectedCustomerId)}`);
    const testClockId = typeof stripeCustomer.test_clock === "string"
      ? stripeCustomer.test_clock
      : stripeCustomer.test_clock?.id;
    let stripeNowSeconds = Math.floor(Date.now() / 1000);
    if (testClockId) {
      const testClock = await stripeRequest<{ status: string; frozen_time: number }>(
        `/v1/test_helpers/test_clocks/${encodeURIComponent(testClockId)}`,
      );
      if (testClock.status !== "ready") {
        throw new Error("The Stripe test clock must finish advancing before card setup can be completed.");
      }
      stripeNowSeconds = testClock.frozen_time;
    }

    const hasPriorStripeSubscription = history.length > 0;
    const localTrialEnd = account.trialEndsAt
      ? Math.floor(account.trialEndsAt.getTime() / 1000)
      : null;
    const preserveLocalTrial =
      !hasPriorStripeSubscription &&
      account.subscriptionStatus === "trial" &&
      localTrialEnd !== null &&
      localTrialEnd > stripeNowSeconds;
    const requestedTrialDays = Number(session.metadata?.trialPeriodDays);
    const firstDirectTrialEnd = resolveFirstDirectSetupTrialEnd({
      trialPolicy: session.metadata?.trialPolicy,
      trialPeriodDays: requestedTrialDays,
      subscriptionStatus: account.subscriptionStatus,
      hasStripeSubscriptionHistory: hasPriorStripeSubscription,
      stripeNowSeconds,
    });
    const trialEnd = preserveLocalTrial
      ? localTrialEnd
      : firstDirectTrialEnd;
    const customerParams = new URLSearchParams({
      "invoice_settings[default_payment_method]": paymentMethodId,
    });
    await stripeRequest(
      `/v1/customers/${encodeURIComponent(expectedCustomerId)}`,
      {
        method: "POST",
        body: customerParams,
        idempotencyKey: `cms-setup-default-payment-${session.id}`,
      },
    );
    const params = new URLSearchParams({
      customer: expectedCustomerId,
      "items[0][price]": priceId,
      "items[0][quantity]": "1",
      default_payment_method: paymentMethodId,
      collection_method: "charge_automatically",
      // An expired local trial must charge the saved card now (or fail),
      // rather than persist an incomplete subscription with an open invoice.
      payment_behavior: "error_if_incomplete",
      proration_behavior: "none",
      "metadata[accountId]": account.id,
      "metadata[setupCheckoutSessionId]": session.id,
      "metadata[checkoutPolicy]": LOCAL_TRIAL_SETUP_POLICY,
    });
    if (session.metadata?.removalResubscribe === "true") {
      params.set("metadata[removalResubscribe]", "true");
      params.set("metadata[removedAt]", session.metadata.removedAt ?? "");
      params.set(
        "metadata[authenticatedCheckoutAt]",
        session.metadata.authenticatedCheckoutAt ?? "",
      );
    }
    if (trialEnd !== null) {
      params.set("trial_end", String(trialEnd));
    }

    const created = await stripeRequest<SubscriptionLike & {
      id: string;
      status: string;
      trial_end?: number | null;
      items: Stripe.ApiList<Stripe.SubscriptionItem & {
        current_period_start?: number;
        current_period_end?: number;
      }>;
    }>("/v1/subscriptions", {
      method: "POST",
      body: params,
      idempotencyKey: `cms-setup-subscription-${session.id}`,
    });

    const firstItem = created.items.data[0];
    await tx.update(accounts).set({
      stripeSubscriptionId: created.id,
      stripeCustomerId: expectedCustomerId,
      stripePriceId: firstItem?.price.id ?? priceId,
      subscriptionStatus: created.status,
      subscriptionCurrentPeriodStart: timestamp(
        firstItem?.current_period_start ?? created.current_period_start,
      ),
      subscriptionCurrentPeriodEnd: timestamp(
        firstItem?.current_period_end ?? created.current_period_end,
      ),
      subscriptionCancelAtPeriodEnd: false,
      subscriptionCanceledAt: null,
      ...(created.trial_end
        ? { trialEndsAt: timestamp(created.trial_end) }
        : {}),
      updatedAt: new Date(),
    }).where(eq(accounts.id, account.id));
    return created.id;
  });

  if (accountSubscriptionId) await syncStripeSubscriptionById(accountSubscriptionId);
  return accountSubscriptionId;
}

/**
 * A deleted event itself is authoritative: retrieving that subscription can
 * fail after deletion, and must not be a prerequisite to revoking local access.
 * Match the account's current subscription before writing so an older delete
 * event cannot overwrite a newer subscription already synced for that account.
 */
async function markSubscriptionDeleted(subscription: SubscriptionLike): Promise<void> {
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
  const accountId = subscription.metadata?.accountId;
  if (!customerId && !accountId) return;

  const [account] = await db.select({
    id: accounts.id,
    stripeCustomerId: accounts.stripeCustomerId,
    stripeSubscriptionId: accounts.stripeSubscriptionId,
    subscriptionStatus: accounts.subscriptionStatus,
  }).from(accounts).where(accountId
    ? eq(accounts.id, accountId)
    : eq(accounts.stripeCustomerId, customerId)).limit(1);
  if (!account) return;
  if (account.subscriptionStatus === "removed") return;
  if (account.stripeCustomerId && account.stripeCustomerId !== customerId) return;
  if (
    account.stripeSubscriptionId &&
    account.stripeSubscriptionId !== subscription.id
  ) return;

  await db.update(accounts).set({
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: "canceled",
    subscriptionCurrentPeriodStart: timestamp(
      subscription.items.data[0]?.current_period_start ?? subscription.current_period_start,
    ),
    subscriptionCurrentPeriodEnd: timestamp(
      subscription.items.data[0]?.current_period_end ?? subscription.current_period_end,
    ),
    subscriptionCancelAtPeriodEnd: false,
    subscriptionCanceledAt: timestamp(subscription.canceled_at) ?? new Date(),
    trialEndsAt: null,
    updatedAt: new Date(),
  }).where(and(
    eq(accounts.id, account.id),
    or(
      eq(accounts.stripeSubscriptionId, subscription.id),
      isNull(accounts.stripeSubscriptionId),
    ),
  ));
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
        if (
          session.mode === "setup" &&
          session.metadata?.setupPolicy === LOCAL_TRIAL_SETUP_POLICY
        ) {
          await createSubscriptionFromSetupCheckout(session as SetupCheckoutSession);
          break;
        }
        const subscription = await retrieveSubscription(session.subscription);
        if (subscription) await syncSubscription(subscription);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        // Retrieve current state so duplicate or out-of-order events converge.
        const subscription = await retrieveSubscription(event.data.object as Stripe.Subscription);
        if (subscription) await syncSubscription(subscription);
        break;
      }
      case "customer.subscription.deleted": {
        await markSubscriptionDeleted(event.data.object as SubscriptionLike);
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getInvoiceSubscriptionId(invoice);
        if (subscriptionId) await syncStripeSubscriptionById(subscriptionId);
        // Accrual failures must reach the webhook route so Stripe retries; the
        // invoice ID's unique ledger constraint makes a replay idempotent.
        await accrueCommissionFromInvoice(invoice);
        break;
      }
      case "charge.refunded":
      case "charge.dispute.created":
      case "charge.dispute.updated":
      case "charge.dispute.closed":
      case "charge.dispute.funds_reinstated":
      case "charge.dispute.funds_withdrawn": {
        await processInvoiceRiskEvent({
          event,
          eventType: event.type,
          eventObject: event.data.object as Stripe.Charge | Stripe.Dispute,
        });
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
