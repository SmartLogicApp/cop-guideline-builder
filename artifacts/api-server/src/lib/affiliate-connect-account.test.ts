import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import { isTestExpressRecipient } from "./affiliate-connect-account.ts";

function client(dashboard: string, hasRecipient = true): Stripe {
  return {
    v2: { core: { accounts: { retrieve: async () => ({
      livemode: false, dashboard, configuration: { recipient: hasRecipient ? {} : null },
    }) } } },
  } as unknown as Stripe;
}

function snapshot(type: string): Stripe.Account {
  return { id: "acct_test", type } as unknown as Stripe.Account;
}

test("v1 Express accounts are accepted with a Test-only client", async () => {
  assert.equal(await isTestExpressRecipient(client("none"), snapshot("express")), true);
});

test("v2 accounts presented as v1 type none require an Express recipient configuration", async () => {
  assert.equal(await isTestExpressRecipient(client("express"), snapshot("none")), true);
  assert.equal(await isTestExpressRecipient(client("none"), snapshot("none")), false);
  assert.equal(await isTestExpressRecipient(client("express", false), snapshot("none")), false);
  assert.equal(await isTestExpressRecipient(client("express"), snapshot("standard")), false);
});