import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileTestWebhookEndpointForDevelopment,
  type TestWebhookClient,
} from "./stripe-test-webhook.ts";

const endpoint = {
  id: "we_Test123",
  url: "https://old-preview.replit.dev/api/stripe/webhook?v=2",
  livemode: false,
  status: "enabled",
  enabled_events: [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
  ],
};

function fakeStripe(existing: typeof endpoint = endpoint) {
  const retrieved: string[] = [];
  const updates: { id: string; params: { url: string } }[] = [];
  const stripe: TestWebhookClient = {
    webhookEndpoints: {
      async retrieve(id) {
        retrieved.push(id);
        return existing;
      },
      async update(id, params) {
        updates.push({ id, params });
        return { ...existing, ...params };
      },
    },
  };
  return { stripe, retrieved, updates };
}

const validInput = (stripe: TestWebhookClient) => ({
  nodeEnv: "development",
  testSecretKey: "sk_test_unit_test",
  testWebhookSecret: "whsec_unit_test",
  endpointId: "we_Test123",
  previewDomain: "new-preview.replit.dev",
  stripe,
});

test("retrieves the configured Test endpoint by ID and changes only its URL, preserving ?v=2", async () => {
  const fake = fakeStripe();
  const result = await reconcileTestWebhookEndpointForDevelopment(validInput(fake.stripe));

  assert.deepEqual(fake.retrieved, ["we_Test123"]);
  assert.deepEqual(fake.updates, [{
    id: "we_Test123",
    params: { url: "https://new-preview.replit.dev/api/stripe/webhook?v=2" },
  }]);
  assert.deepEqual(result, {
    status: "updated",
    endpointId: "we_Test123",
    url: "https://new-preview.replit.dev/api/stripe/webhook?v=2",
  });
});

test("an already-current endpoint is not mutated", async () => {
  const fake = fakeStripe({
    ...endpoint,
    url: "https://new-preview.replit.dev/api/stripe/webhook?v=2",
  });
  const result = await reconcileTestWebhookEndpointForDevelopment(validInput(fake.stripe));
  assert.equal(result.status, "unchanged");
  assert.deepEqual(fake.updates, []);
});

test("missing ID, invalid domain, non-development, or missing Test credentials do not call Stripe", async () => {
  for (const override of [
    { endpointId: undefined },
    { endpointId: "bad_id" },
    { previewDomain: "cmscomplianceguardian.com" },
    { nodeEnv: "production" },
    { testSecretKey: "sk_live_unit_test" },
    { testWebhookSecret: undefined },
  ]) {
    const fake = fakeStripe();
    const result = await reconcileTestWebhookEndpointForDevelopment({
      ...validInput(fake.stripe), ...override,
    });
    assert.equal(result.status, "skipped");
    assert.deepEqual(fake.retrieved, []);
    assert.deepEqual(fake.updates, []);
  }
});

test("wrong account, disabled, non-billing URL, or missing billing events block updates", async () => {
  for (const existing of [
    { ...endpoint, id: "we_other" },
    { ...endpoint, livemode: true },
    { ...endpoint, status: "disabled" },
    { ...endpoint, url: "https://old-preview.replit.dev/api/other?v=2" },
    { ...endpoint, url: "https://old-preview.replit.dev/api/stripe/webhook?secret=unsafe" },
    { ...endpoint, enabled_events: ["checkout.session.completed"] },
  ]) {
    const fake = fakeStripe(existing);
    const result = await reconcileTestWebhookEndpointForDevelopment(validInput(fake.stripe));
    assert.equal(result.status, "skipped");
    assert.deepEqual(fake.updates, []);
  }
});

test("a visible signing-secret mismatch blocks mutation", async () => {
  const fake = fakeStripe({ ...endpoint, secret: "whsec_other" } as typeof endpoint);
  const result = await reconcileTestWebhookEndpointForDevelopment(validInput(fake.stripe));
  assert.deepEqual(result, {
    status: "skipped",
    reason: "test-billing-webhook-signing-secret-mismatch",
  });
  assert.deepEqual(fake.updates, []);
});