import type Stripe from "stripe";

// Accounts v1 exposes only provided flags, not the tax identifier itself.
// Do not request, copy, serialize, or log individual/company identity objects.
export function stripeTaxStatus(account: Stripe.Account): "verified_complete" | "submitted_to_stripe" | "not_started" {
  const provided = account.business_type === "individual"
    ? account.individual?.id_number_provided === true
    : account.business_type === "company"
      ? account.company?.tax_id_provided === true
      : false;
  if (!provided) return "not_started";

  const requirements = account.requirements;
  if (!requirements) return "submitted_to_stripe";
  const outstanding = [
    ...(requirements?.currently_due ?? []),
    ...(requirements?.past_due ?? []),
    ...(requirements?.pending_verification ?? []),
    ...(requirements?.eventually_due ?? []),
    ...(requirements?.errors?.map((error) => error.requirement) ?? []),
  ];
  const taxRelated = /(?:^|\.)(?:tax[^.]*|id_number|ssn[^.]*|ein|tin)(?:$|\.)/i;
  return outstanding.some((field) => typeof field === "string" && taxRelated.test(field))
    ? "submitted_to_stripe" : "verified_complete";
}