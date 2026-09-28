import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import type Stripe from "stripe";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && specifier.endsWith(".js")) {
      try { return nextResolve(`${specifier.slice(0, -3)}.ts`, context); } catch { /* use normal resolution */ }
    }
    return nextResolve(specifier, context);
  },
});
const { affiliateConnectChecklistStatus } = await import("./affiliate-connect-checklist-status.ts");
const asStripeAccount = (account: object) => account as unknown as Stripe.Account;

const clearRequirements = {
  currently_due: [],
  past_due: [],
  pending_verification: [],
  eventually_due: [],
  errors: [],
};

test("Stripe account.updated facts turn tax and payment checklist steps green only when verified", () => {
  const account = {
    business_type: "individual",
    individual: { id_number_provided: true },
    details_submitted: true,
    payouts_enabled: true,
    charges_enabled: false,
    requirements: clearRequirements,
  };
  const stripeAccount = asStripeAccount(account);
  assert.deepEqual(affiliateConnectChecklistStatus(stripeAccount, true), {
    detailsSubmitted: true,
    payoutsEnabled: true,
    chargesEnabled: false,
    requirementsDue: [],
    onboardingComplete: true,
    taxStatus: "verified_complete",
  });
});

test("Stripe onboarding and tax states remain separate and reflect incomplete Account fields", () => {
  const missingTax = affiliateConnectChecklistStatus({
    business_type: "company",
    company: { tax_id_provided: false },
    details_submitted: true,
    payouts_enabled: true,
    requirements: clearRequirements,
  } as unknown as Stripe.Account, true);
  assert.equal(missingTax.onboardingComplete, true);
  assert.equal(missingTax.taxStatus, "not_started");

  const incompletePayment = affiliateConnectChecklistStatus({
    business_type: "company",
    company: { tax_id_provided: true },
    details_submitted: true,
    payouts_enabled: true,
    requirements: { ...clearRequirements, currently_due: ["individual.address.line1"] },
  } as unknown as Stripe.Account, false);
  assert.equal(incompletePayment.detailsSubmitted, true);
  assert.equal(incompletePayment.payoutsEnabled, false, "v2 transfer capability must also be active");
  assert.equal(incompletePayment.onboardingComplete, false);
  assert.deepEqual(incompletePayment.requirementsDue, ["individual.address.line1"]);
  assert.equal(incompletePayment.taxStatus, "verified_complete", "a non-tax requirement does not erase provided tax status");
});

test("tax remains submitted until Stripe clears a tax requirement", () => {
  const submitted = affiliateConnectChecklistStatus({
    business_type: "individual",
    individual: { id_number_provided: true },
    details_submitted: true,
    payouts_enabled: true,
    requirements: { ...clearRequirements, currently_due: ["individual.id_number"] },
  } as unknown as Stripe.Account, true);
  assert.equal(submitted.taxStatus, "submitted_to_stripe");
  assert.equal(submitted.onboardingComplete, false);
});