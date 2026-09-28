import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { accountUsers, accounts, db } from "@workspace/db";
import { logger } from "./logger.js";
import { deliver } from "./resend-mailer.js";
import {
  TRIAL_WARNING_SUBJECT,
  trialWarningEmailHtml,
  trialWarningWindow,
} from "./trial-warning-email.js";
import { stripeRequest, isStripeConfigured } from "../stripeClient.js";
import { syncStripeSubscriptionById } from "../webhookHandlers.js";
import {
  chooseCanonicalStripeSubscription,
  isStaleForStripeReconciliation,
  preferredAccountEmail,
  type StripeSubscriptionSummary,
} from "./subscription-lifecycle-rules.js";

const DAY_MS = 24 * 60 * 60 * 1_000;
const STRIPE_PAGE_SIZE = 100;
// This cache is an optimization, never the durable source of freshness. A cold
// process (including one resumed after autoscale scale-to-zero) has no entry,
// so the first authenticated account check always reconciles with Stripe.
const lastStripeSyncAtByAccount = new Map<string, number>();
const stripeSyncsInFlight = new Map<string, Promise<void>>();

async function getAllCustomerSubscriptions(customerId: string): Promise<StripeSubscriptionSummary[]> {
  const subscriptions: StripeSubscriptionSummary[] = [];
  const seen = new Set<string>();
  let startingAfter: string | undefined;
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const params = new URLSearchParams({ customer: customerId, status: "all", limit: String(STRIPE_PAGE_SIZE) });
    if (startingAfter) params.set("starting_after", startingAfter);
    const page = await stripeRequest<{
      data: StripeSubscriptionSummary[];
      has_more: boolean;
    }>(`/v1/subscriptions?${params.toString()}`);
    if (!page || !Array.isArray(page.data) || typeof page.has_more !== "boolean") {
      throw new Error("Stripe returned an invalid subscription reconciliation page.");
    }
    for (const subscription of page.data) {
      if (
        !subscription ||
        typeof subscription.id !== "string" ||
        !subscription.id ||
        typeof subscription.status !== "string" ||
        typeof subscription.created !== "number" ||
        seen.has(subscription.id)
      ) {
        throw new Error("Stripe returned incomplete or repeated subscription reconciliation data.");
      }
      seen.add(subscription.id);
      subscriptions.push(subscription);
    }
    if (!page.has_more) return subscriptions;
    const nextCursor = page.data.at(-1)?.id;
    if (!nextCursor || nextCursor === startingAfter) {
      throw new Error("Stripe subscription reconciliation pagination did not advance.");
    }
    startingAfter = nextCursor;
  }
  throw new Error("Stripe subscription reconciliation exceeded its pagination safety limit.");
}

/**
 * Reconcile the account against Stripe's full customer subscription history.
 * This converges to the newest non-terminal subscription, is safe to repeat,
 * and never treats an absent Stripe subscription as a paid subscription.
 */
export async function reconcileStripeCustomerAccount(
  account: {
    id: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string | null;
    subscriptionStatus: string | null;
  },
): Promise<void> {
  // Administrator removal is durable even if an old or replacement Stripe
  // subscription appears in customer history. Only a new authenticated
  // checkout has a route back from this state.
  if (account.subscriptionStatus === "removed") return;
  const history = await getAllCustomerSubscriptions(account.stripeCustomerId);
  const canonical = chooseCanonicalStripeSubscription(history);
  if (canonical) {
    await syncStripeSubscriptionById(canonical.id);
    return;
  }

  if (!account.stripeSubscriptionId) return;

  await db.update(accounts).set({
    subscriptionStatus: "canceled",
    subscriptionCancelAtPeriodEnd: false,
    subscriptionCanceledAt: new Date(),
    trialEndsAt: null,
    updatedAt: new Date(),
  }).where(eq(accounts.id, account.id));
}

export async function reconcileAccountSubscriptionIfStale(
  account: {
    id: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    subscriptionStatus: string | null;
  },
  now = new Date(),
): Promise<boolean> {
  const lastStripeSyncAt = lastStripeSyncAtByAccount.get(account.id);
  const lastStripeSyncDate = lastStripeSyncAt === undefined ? null : new Date(lastStripeSyncAt);
  if (!account.stripeCustomerId || !isStaleForStripeReconciliation(lastStripeSyncDate, now)) {
    return false;
  }
  if (!isStripeConfigured()) {
    throw new Error("Stripe is not configured; subscription access could not be refreshed.");
  }
  const inFlight = stripeSyncsInFlight.get(account.id);
  if (inFlight) {
    await inFlight;
    return true;
  }
  const sync = reconcileStripeCustomerAccount({
    id: account.id,
    stripeCustomerId: account.stripeCustomerId,
    stripeSubscriptionId: account.stripeSubscriptionId,
    subscriptionStatus: account.subscriptionStatus,
  });
  stripeSyncsInFlight.set(account.id, sync);
  try {
    await sync;
    lastStripeSyncAtByAccount.set(account.id, now.getTime());
  } finally {
    stripeSyncsInFlight.delete(account.id);
  }
  return true;
}

function getBillingBaseUrl(): string {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  const host = configured
    ? new URL(configured).origin
    : process.env.REPLIT_DOMAINS?.split(",")[0]?.trim()
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]!.trim()}`
      : null;
  if (!host) throw new Error("PUBLIC_APP_URL or REPLIT_DOMAINS is required to send trial reminders.");
  const parsed = new URL(host);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("Trial reminder links must use a trusted HTTPS application URL.");
  }
  return parsed.origin;
}

function trialEmailSender(): string {
  return process.env.TRIAL_EMAIL_FROM?.trim() ||
    process.env.CLERK_EMAIL_FROM?.trim() ||
    "CMS Compliance Suite <onboarding@resend.dev>";
}

async function sendTrialEndingReminderForAccount(
  accountId: string,
  now = new Date(),
): Promise<{ sent: boolean; error?: string; warning?: string }> {
  const { start, end } = trialWarningWindow(now);
  const [account] = await db.select().from(accounts).where(and(
    eq(accounts.id, accountId),
    inArray(accounts.subscriptionStatus, ["trial", "trialing"]),
    gte(accounts.trialEndsAt, start),
    lt(accounts.trialEndsAt, end),
    isNull(accounts.trialWarningEmailSentAt),
  )).limit(1);
  if (!account?.trialEndsAt) return { sent: false };

  const users = await db.select().from(accountUsers).where(
    eq(accountUsers.accountId, account.id),
  );
  const recipient = preferredAccountEmail(users);
  if (!recipient) {
    const warning = "No email on file";
    logger.warn({ accountId }, "Trial reminder skipped: no email on file.");
    return { sent: false, warning };
  }

  const billingUrl = `${getBillingBaseUrl()}/billing`;
  // Claim atomically before delivery so concurrent requests and API instances
  // can never send two warnings for this account.
  const [claimed] = await db.update(accounts)
    .set({ trialWarningEmailSentAt: now })
    .where(and(eq(accounts.id, account.id), isNull(accounts.trialWarningEmailSentAt)))
    .returning({ id: accounts.id });
  if (!claimed) return { sent: false };
  try {
    const result = await deliver({
      from: trialEmailSender(),
      to: [recipient],
      subject: TRIAL_WARNING_SUBJECT,
      html: trialWarningEmailHtml({
        facilityName: account.facilityName,
        trialEndsAt: account.trialEndsAt,
        billingUrl,
      }),
    });
    if (!result.sent) throw new Error(result.error);
    return { sent: true };
  } catch (error) {
    await db.update(accounts).set({ trialWarningEmailSentAt: null }).where(and(
      eq(accounts.id, account.id),
      eq(accounts.trialWarningEmailSentAt, now),
    ));
    logger.error({ err: error, accountId: account.id }, "Trial-ending reminder delivery failed.");
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Trial reminder delivery failed.",
    };
  }
}

type LifecycleAccountFailure = {
  accountId: string;
  operation: "stripe-reconciliation" | "trial-reminder";
  error: string;
};

type LifecycleAccountWarning = {
  accountId: string;
  operation: "trial-reminder";
  warning: string;
};

type TrialReminderSweepResult = {
  accountsScanned: number;
  sent: number;
  failures: LifecycleAccountFailure[];
  warnings: LifecycleAccountWarning[];
};

async function sendTrialEndingReminders(now = new Date()): Promise<TrialReminderSweepResult> {
  const candidates = await db.select({ id: accounts.id }).from(accounts).where(
    inArray(accounts.subscriptionStatus, ["trial", "trialing"]),
  );
  const failures: LifecycleAccountFailure[] = [];
  const warnings: LifecycleAccountWarning[] = [];
  let sent = 0;
  for (const account of candidates) {
    try {
      const result = await sendTrialEndingReminderForAccount(account.id, now);
      if (result.sent) sent += 1;
      if (result.error) {
        failures.push({
          accountId: account.id,
          operation: "trial-reminder",
          error: result.error,
        });
      }
      if (result.warning) {
        warnings.push({
          accountId: account.id,
          operation: "trial-reminder",
          warning: result.warning,
        });
      }
    } catch (error) {
      failures.push({
        accountId: account.id,
        operation: "trial-reminder",
        error: error instanceof Error ? error.message : "Trial reminder failed.",
      });
    }
  }
  return { accountsScanned: candidates.length, sent, failures, warnings };
}

/**
 * Single authenticated-account lifecycle check. It is deliberately invoked
 * from account access, not only a background timer, so a scaled-to-zero API
 * always reconciles that account on the first request after waking.
 */
export async function runAccountSubscriptionLifecycle(
  account: {
    id: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    subscriptionStatus: string | null;
  },
  now = new Date(),
): Promise<void> {
  await reconcileAccountSubscriptionIfStale(account, now);
  await sendTrialEndingReminderForAccount(account.id, now);
}

export type DailySubscriptionLifecycleResult = {
  accountsScanned: number;
  stripeAccountsProcessed: number;
  trialReminderAccountsScanned: number;
  trialRemindersSent: number;
  failures: LifecycleAccountFailure[];
  warnings: LifecycleAccountWarning[];
};

let dailyRun: Promise<DailySubscriptionLifecycleResult> | null = null;

export async function runDailySubscriptionLifecycle(
  now = new Date(),
): Promise<DailySubscriptionLifecycleResult> {
  if (dailyRun) return dailyRun;
  dailyRun = (async () => {
    const customerAccounts = await db.select({
      id: accounts.id,
      stripeCustomerId: accounts.stripeCustomerId,
      stripeSubscriptionId: accounts.stripeSubscriptionId,
      subscriptionStatus: accounts.subscriptionStatus,
    }).from(accounts);
    const failures: LifecycleAccountFailure[] = [];
    let stripeAccountsProcessed = 0;
    for (const account of customerAccounts) {
      if (!account.stripeCustomerId) continue;
      if (account.subscriptionStatus !== "removed" && !isStripeConfigured()) {
        failures.push({
          accountId: account.id,
          operation: "stripe-reconciliation",
          error: "Stripe is not configured; subscription state could not be refreshed.",
        });
        continue;
      }
      try {
        await reconcileStripeCustomerAccount({
          id: account.id,
          stripeCustomerId: account.stripeCustomerId,
          stripeSubscriptionId: account.stripeSubscriptionId,
          subscriptionStatus: account.subscriptionStatus,
        });
        stripeAccountsProcessed += 1;
      } catch (error) {
        logger.error({ err: error, accountId: account.id }, "Daily Stripe subscription reconciliation failed.");
        failures.push({
          accountId: account.id,
          operation: "stripe-reconciliation",
          error: error instanceof Error ? error.message : "Stripe reconciliation failed.",
        });
      }
    }
    const reminders = await sendTrialEndingReminders(now);
    failures.push(...reminders.failures);
    return {
      accountsScanned: customerAccounts.length,
      stripeAccountsProcessed,
      trialReminderAccountsScanned: reminders.accountsScanned,
      trialRemindersSent: reminders.sent,
      failures,
      warnings: reminders.warnings,
    };
  })().finally(() => {
    dailyRun = null;
  });
  return dailyRun;
}

let schedulerStarted = false;

/**
 * The resident timer is only a best-effort sweep while an API instance stays
 * awake. Correctness does not depend on it: the first authenticated account
 * request after cold start and each account's 24-hour in-process freshness
 * window invokes the same reconciliation and reminder path.
 */
export function startSubscriptionLifecycleScheduler(): void {
  if (
    schedulerStarted ||
    process.env.API_READINESS_SMOKE === "1" ||
    !["development", "production"].includes(process.env.NODE_ENV ?? "")
  ) return;
  schedulerStarted = true;
  const run = () => void runDailySubscriptionLifecycle().then((result) => {
    if (result.failures.length > 0) {
      logger.error(
        {
          accountsScanned: result.accountsScanned,
          stripeAccountsProcessed: result.stripeAccountsProcessed,
          trialRemindersSent: result.trialRemindersSent,
          failedAccountCount: new Set(result.failures.map((failure) => failure.accountId)).size,
          failures: result.failures,
        },
        "Daily subscription lifecycle run completed with failures.",
      );
    }
  }).catch((error) => {
    logger.error({ err: error }, "Daily subscription lifecycle run failed.");
  });
  run();
  const timer = setInterval(run, DAY_MS);
  timer.unref();
}