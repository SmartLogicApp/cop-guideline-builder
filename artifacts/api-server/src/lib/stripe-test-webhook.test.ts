import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileTestWebhookEndpointForDevelopment,
  type TestWebhookClient,
} from "./stripe-test-webhook.ts";

const endpoint = {
  id: "we_test_existing",
  url: "https://old-preview.replit.dev/api/stripe/webhook",
  livemode: false,
  status: "enabled",
};

function fakeStripe(endpoints: typeof endpoint[] = [endpoint]) {
  const updates: { id: string; params: { url: string } }[] = [];
  let listCalls = 0;
  const stripe: TestWebhookClient = {
    webhookEndpoints: {
      async list() {
        listCalls += 1;
        return { data: endpoints, has_more: false };
      },
      async update(id, params) {
        updates.push({ id, params });
        return { ...endpoint, ...params, id };
      },
    },
  };
  return { stripe, updates, getListCalls: () => listCalls };
}

const validInput = (stripe: TestWebhookClient) => ({
  nodeEnv: "development",
  testSecretKey: "sk_test_unit_test",
  testWebhookSecret: "whsec_unit_test",
  previewDomain: "new-preview.replit.dev",
  stripe,
});

test("development reconciles one existing Test endpoint using only its URL", async () => {
  const fake = fakeStripe();
  const result = await reconcileTestWebhookEndpointForDevelopment(validInput(fake.stripe));

  assert.deepEqual(result, {
    status: "updated",
    endpointId: "we_test_existing",
    url: "https://new-preview.replit.dev/api/stripe/webhook",
  });
  assert.deepEqual(fake.updates, [{
    id: "we_test_existing",
    params: { url: "https://new-preview.replit.dev/api/stripe/webhook" },
  }]);
});

test("an already-current Test endpoint is not mutated", async () => {
  const current = {
    ...endpoint,
    url: "https://new-preview.replit.dev/api/stripe/webhook",
  };
  const fake = fakeStripe([current]);
  const result = await reconcileTestWebhookEndpointForDevelopment(validInput(fake.stripe));

  assert.equal(result.status, "unchanged");
  assert.deepEqual(fake.updates, []);
});

test("missing or ambiguous Test endpoints fail closed without creating or updating", async () => {
  for (const endpoints of [
    [],
    [endpoint, { ...endpoint, id: "we_test_second" }],
  ]) {
    const fake = fakeStripe(endpoints);
    const result = await reconcileTestWebhookEndpointForDevelopment(validInput(fake.stripe));
    assert.equal(result.status, "skipped");
    assert.deepEqual(fake.updates, []);
  }
});

test("Live endpoints are ignored and never updated", async () => {
  const liveEndpoint = { ...endpoint, id: "we_live_do_not_touch", livemode: true };
  const fake = fakeStripe([liveEndpoint]);
  const result = await reconcileTestWebhookEndpointForDevelopment(validInput(fake.stripe));

  assert.deepEqual(result, {
    status: "skipped",
    reason: "no-test-billing-webhook-endpoint-found",
  });
  assert.deepEqual(fake.updates, []);
});

test("a visible signing-secret mismatch blocks endpoint mutation", async () => {
  const mismatch = { ...endpoint, secret: "whsec_other" };
  const fake = fakeStripe([mismatch]);
  const result = await reconcileTestWebhookEndpointForDevelopment(validInput(fake.stripe));

  assert.deepEqual(result, {
    status: "skipped",
    reason: "test-billing-webhook-signing-secret-mismatch",
  });
  assert.deepEqual(fake.updates, []);
});

test("reconciliation never runs outside development or without explicit test secrets", async () => {
  const fake = fakeStripe();
  const prodResult = await reconcileTestWebhookEndpointForDevelopment({
    ...validInput(fake.stripe),
    nodeEnv: "production",
  });
  const liveKeyResult = await reconcileTestWebhookEndpointForDevelopment({
    ...validInput(fake.stripe),
    testSecretKey: "sk_live_unit_test",
  });
  const missingWebhookSecretResult = await reconcileTestWebhookEndpointForDevelopment({
    ...validInput(fake.stripe),
    testWebhookSecret: undefined,
  });

  assert.equal(prodResult.status, "skipped");
  assert.equal(liveKeyResult.status, "skipped");
  assert.equal(missingWebhookSecretResult.status, "skipped");
  assert.equal(fake.getListCalls(), 0);
  assert.deepEqual(fake.updates, []);
});

test("non-preview, missing, or malformed Replit domains fail closed", async () => {
  for (const previewDomain of [
    undefined,
    "cmscomplianceguardian.com",
    "https://preview.replit.dev",
    "preview.replit.dev/path",
  ]) {
    const fake = fakeStripe();
    const result = await reconcileTestWebhookEndpointForDevelopment({
      ...validInput(fake.stripe),
      previewDomain,
    });
    assert.equal(result.status, "skipped");
    assert.equal(fake.getListCalls(), 0);
    assert.deepEqual(fake.updates, []);
  }
});