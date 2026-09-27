type Endpoint = {
  id: string;
  url: string;
  livemode: boolean;
  status: "enabled" | "disabled" | string;
  enabled_events: string[];
  secret?: string;
};

export type TestWebhookClient = {
  webhookEndpoints: {
    retrieve(id: string): Promise<Endpoint>;
    update(id: string, params: { url: string }): Promise<Endpoint>;
  };
};

export type TestWebhookReconciliation =
  | { status: "updated" | "unchanged"; endpointId: string; url: string }
  | { status: "skipped"; reason: string };

const BILLING_WEBHOOK_PATH = "/api/stripe/webhook";
const REQUIRED_BILLING_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
];

function previewWebhookUrl(domain: string | undefined): string | null {
  const value = domain?.trim();
  if (!value || value.includes("/") || value.includes("@")) return null;

  try {
    const candidate = new URL(`https://${value}`);
    if (
      candidate.hostname !== value.toLowerCase() ||
      !candidate.hostname.endsWith(".replit.dev") ||
      candidate.pathname !== "/" ||
      candidate.search ||
      candidate.hash
    ) {
      return null;
    }
    return `https://${candidate.hostname}${BILLING_WEBHOOK_PATH}`;
  } catch {
    return null;
  }
}

function billingWebhookQuery(endpoint: Endpoint): string | null {
  try {
    const url = new URL(endpoint.url);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".replit.dev") ||
      url.pathname !== BILLING_WEBHOOK_PATH ||
      (url.search !== "" && url.search !== "?v=2") ||
      url.hash
    ) return null;
    return url.search;
  } catch {
    return null;
  }
}

/**
 * Keep the explicitly configured Test-mode billing endpoint aimed at the current
 * Replit dev host. Never discover another endpoint or create one. Stripe's
 * URL-only update preserves its event subscriptions and signing secret.
 */
export async function reconcileTestWebhookEndpointForDevelopment({
  nodeEnv,
  testSecretKey,
  testWebhookSecret,
  endpointId,
  previewDomain,
  stripe,
}: {
  nodeEnv: string | undefined;
  testSecretKey: string | undefined;
  testWebhookSecret: string | undefined;
  endpointId: string | undefined;
  previewDomain: string | undefined;
  stripe: TestWebhookClient;
}): Promise<TestWebhookReconciliation> {
  if (nodeEnv !== "development") {
    return { status: "skipped", reason: "not-development" };
  }
  if (!testSecretKey?.trim().startsWith("sk_test_")) {
    return { status: "skipped", reason: "test-api-key-not-configured" };
  }
  const localSigningSecret = testWebhookSecret?.trim();
  if (!localSigningSecret?.startsWith("whsec_")) {
    return { status: "skipped", reason: "test-webhook-signing-secret-not-configured" };
  }
  if (!endpointId || !/^we_[A-Za-z0-9]+$/.test(endpointId)) {
    return { status: "skipped", reason: "test-billing-webhook-endpoint-id-not-configured" };
  }
  const previewUrl = previewWebhookUrl(previewDomain);
  if (!previewUrl) {
    return { status: "skipped", reason: "current-replit-preview-domain-unavailable-or-invalid" };
  }

  const endpoint = await stripe.webhookEndpoints.retrieve(endpointId);
  if (!endpoint || endpoint.id !== endpointId || endpoint.livemode !== false) {
    return { status: "skipped", reason: "configured-endpoint-is-not-the-test-billing-endpoint" };
  }
  if (endpoint.status !== "enabled") {
    return { status: "skipped", reason: "test-billing-webhook-endpoint-is-disabled" };
  }
  const query = billingWebhookQuery(endpoint);
  if (query === null || !Array.isArray(endpoint.enabled_events) ||
    (!endpoint.enabled_events.includes("*") &&
      REQUIRED_BILLING_EVENTS.some((event) => !endpoint.enabled_events.includes(event)))) {
    return { status: "skipped", reason: "configured-endpoint-url-or-events-do-not-match-billing" };
  }
  // Stripe only returns an endpoint secret when creating it. If it is present
  // anyway, treat a mismatch as a hard stop; never rotate or replace secrets.
  if (endpoint.secret && endpoint.secret !== localSigningSecret) {
    return { status: "skipped", reason: "test-billing-webhook-signing-secret-mismatch" };
  }
  const targetUrl = previewUrl + query;
  if (endpoint.url === targetUrl) {
    return { status: "unchanged", endpointId: endpoint.id, url: targetUrl };
  }

  // Do not pass event subscriptions, enabled state, metadata, or any secret:
  // the only remote mutation permitted is changing this endpoint's URL.
  const updated = await stripe.webhookEndpoints.update(endpoint.id, { url: targetUrl });
  if (
    updated.id !== endpoint.id ||
    updated.livemode !== false ||
    updated.url !== targetUrl ||
    updated.status !== "enabled" ||
    (updated.secret !== undefined && updated.secret !== localSigningSecret)
  ) {
    throw new Error("Stripe did not confirm the Test webhook endpoint URL update.");
  }
  return { status: "updated", endpointId: endpoint.id, url: targetUrl };
}