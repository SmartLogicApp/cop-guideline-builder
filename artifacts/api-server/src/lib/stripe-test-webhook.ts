type Endpoint = {
  id: string;
  url: string;
  livemode: boolean;
  status: "enabled" | "disabled" | string;
  secret?: string;
};

export type TestWebhookClient = {
  webhookEndpoints: {
    list(params: { limit: number; starting_after?: string }): Promise<{
      data: Endpoint[];
      has_more: boolean;
    }>;
    update(id: string, params: { url: string }): Promise<Endpoint>;
  };
};

export type TestWebhookReconciliation =
  | { status: "updated" | "unchanged"; endpointId: string; url: string }
  | { status: "skipped"; reason: string };

const BILLING_WEBHOOK_PATH = "/api/stripe/webhook";
const ENDPOINTS_PER_PAGE = 100;
const MAX_ENDPOINT_PAGES = 100;

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

function isBillingWebhookEndpoint(endpoint: Endpoint): boolean {
  try {
    const url = new URL(endpoint.url);
    return url.protocol === "https:" &&
      url.pathname === BILLING_WEBHOOK_PATH &&
      !url.search &&
      !url.hash;
  } catch {
    return false;
  }
}

async function listAllTestBillingWebhookEndpoints(
  stripe: TestWebhookClient,
): Promise<Endpoint[]> {
  const endpoints: Endpoint[] = [];
  const seenIds = new Set<string>();
  let startingAfter: string | undefined;

  for (let pageNumber = 0; pageNumber < MAX_ENDPOINT_PAGES; pageNumber += 1) {
    const page = await stripe.webhookEndpoints.list({
      limit: ENDPOINTS_PER_PAGE,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    if (
      !page ||
      !Array.isArray(page.data) ||
      typeof page.has_more !== "boolean" ||
      page.data.some((endpoint) =>
        !endpoint ||
        typeof endpoint.id !== "string" ||
        !endpoint.id ||
        typeof endpoint.url !== "string" ||
        typeof endpoint.livemode !== "boolean" ||
        typeof endpoint.status !== "string"
      )
    ) {
      throw new Error("Stripe returned an incomplete webhook endpoint page.");
    }

    for (const endpoint of page.data) {
      if (seenIds.has(endpoint.id)) {
        throw new Error("Stripe webhook endpoint pagination repeated an object.");
      }
      seenIds.add(endpoint.id);
      if (endpoint.livemode === false && isBillingWebhookEndpoint(endpoint)) {
        endpoints.push(endpoint);
      }
    }

    if (!page.has_more) return endpoints;
    const nextCursor = page.data.at(-1)?.id;
    if (!nextCursor || nextCursor === startingAfter) {
      throw new Error("Stripe webhook endpoint pagination did not advance.");
    }
    startingAfter = nextCursor;
  }

  throw new Error("Stripe webhook endpoint listing exceeded the pagination safety limit.");
}

/**
 * Keep the single Test-mode billing endpoint aimed at the current Replit dev
 * host. Listing and updating are deliberately separated: no endpoint is ever
 * created, and ambiguous, missing, disabled, or mismatched endpoints are left
 * untouched. Stripe's URL-only update preserves the endpoint's signing secret.
 */
export async function reconcileTestWebhookEndpointForDevelopment({
  nodeEnv,
  testSecretKey,
  testWebhookSecret,
  previewDomain,
  stripe,
}: {
  nodeEnv: string | undefined;
  testSecretKey: string | undefined;
  testWebhookSecret: string | undefined;
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
  const targetUrl = previewWebhookUrl(previewDomain);
  if (!targetUrl) {
    return { status: "skipped", reason: "current-replit-preview-domain-unavailable-or-invalid" };
  }

  const matches = await listAllTestBillingWebhookEndpoints(stripe);
  if (matches.length === 0) {
    return { status: "skipped", reason: "no-test-billing-webhook-endpoint-found" };
  }
  if (matches.length !== 1) {
    return { status: "skipped", reason: "multiple-test-billing-webhook-endpoints-found" };
  }

  const [endpoint] = matches;
  if (endpoint.status !== "enabled") {
    return { status: "skipped", reason: "test-billing-webhook-endpoint-is-disabled" };
  }
  // Stripe only returns an endpoint secret when creating it. If it is present
  // anyway, treat a mismatch as a hard stop; never rotate or replace secrets.
  if (endpoint.secret && endpoint.secret !== localSigningSecret) {
    return { status: "skipped", reason: "test-billing-webhook-signing-secret-mismatch" };
  }
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