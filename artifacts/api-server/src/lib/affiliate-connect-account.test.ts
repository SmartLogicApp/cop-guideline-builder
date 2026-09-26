import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import { verifyExpressRecipient } from "./affiliate-connect-account.ts";

function client(
  dashboard: string,
  status: string | null = "active",
  hasRecipient = true,
  livemode = false,
  statusDetails: unknown[] = [],
): Stripe {
  return {
    v2: { core: { accounts: { retrieve: async () => ({
      livemode, dashboard, configuration: { recipient: hasRecipient ? { applied: true, capabilities: {
        stripe_balance: { stripe_transfers: { status: status ?? undefined, status_details: statusDetails } },
      } } : null },
    }) } } },
  } as unknown as Stripe;
}

function snapshot(type: string, livemode = false): Stripe.Account {
  return { id: "acct_test", type, livemode } as unknown as Stripe.Account;
}

test("v1 Express and v2 type-none accounts require a mode-matched Express recipient", async () => {
  assert.deepEqual(await verifyExpressRecipient(client("express"), snapshot("express"), false), {
    valid: true, transferCapabilityActive: true,
  });
  assert.deepEqual(await verifyExpressRecipient(client("express"), snapshot("none"), false), {
    valid: true, transferCapabilityActive: true,
  });
});

test("only active transfer capability with no status details permits payout", async () => {
  const active = await verifyExpressRecipient(client("express"), snapshot("none"), false);
  assert.equal(active.transferCapabilityActive, true);
  for (const status of ["pending", "restricted", "unsupported", null]) {
    const result = await verifyExpressRecipient(client("express", status), snapshot("none"), false);
    assert.equal(result.valid, true);
    assert.equal(result.transferCapabilityActive, false);
  }
  assert.equal((await verifyExpressRecipient(client("express", "active", true, false, [{}]), snapshot("none"), false))
    .transferCapabilityActive, false);
});

test("mode mismatch, non-Express dashboard, and absent recipient fail closed", async () => {
  assert.equal((await verifyExpressRecipient(client("express", "active", true, true), snapshot("none"), false)).valid, false);
  assert.equal((await verifyExpressRecipient(client("express", "active", true, true), snapshot("none", true), true)).valid, true);
  assert.equal((await verifyExpressRecipient(client("none"), snapshot("none"), false)).valid, false);
  assert.equal((await verifyExpressRecipient(client("express", "active", false), snapshot("none"), false)).valid, false);
  assert.equal((await verifyExpressRecipient(client("express"), snapshot("standard"), false)).valid, false);
});