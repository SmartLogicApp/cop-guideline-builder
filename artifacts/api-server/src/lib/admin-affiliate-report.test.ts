import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  affiliateRestorationDeadline,
  findAffiliateConsultantWorkspace,
  getAffiliateWorkspaceReport,
  type ConsultantWorkspaceLink,
} from "./admin-affiliate-report.ts";

const affiliate = {
  clerkUserId: "user_verified_123",
  email: "consultant@example.com",
  commissionRatePct: 0,
  rateEffectiveAt: new Date("2026-04-01T12:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

function workspace(overrides: Partial<ConsultantWorkspaceLink> = {}): ConsultantWorkspaceLink {
  return {
    clerkUserId: "user_verified_123",
    email: "consultant@example.com",
    hasComplimentaryAccess: false,
    accountId: "account-1",
    accountIdentifierType: "consultant",
    subscriptionStatus: "trial",
    trialEndsAt: new Date("2026-05-01T12:00:00.000Z"),
    subscriptionCurrentPeriodEnd: null,
    subscriptionCancelAtPeriodEnd: false,
    subscriptionCanceledAt: null,
    ...overrides,
  };
}

test("workspace link uses Clerk ID first and will not email-fallback across a bound ID", () => {
  const candidates = [
    workspace({ clerkUserId: "different_user" }),
    workspace({ clerkUserId: "user_verified_123", accountId: "matched-by-id" }),
  ];
  assert.equal(findAffiliateConsultantWorkspace(affiliate, candidates)?.accountId, "matched-by-id");
  assert.equal(findAffiliateConsultantWorkspace(
    { ...affiliate, clerkUserId: "bound_to_someone_else" },
    candidates,
  ), null);
});

test("verified registration email only links an unbound consultant workspace and rejects ambiguity", () => {
  const unboundAffiliate = { ...affiliate, clerkUserId: null };
  const candidate = workspace({
    clerkUserId: "signed_up_with_verified_email",
    email: "  CONSULTANT@EXAMPLE.COM ",
  });
  assert.equal(findAffiliateConsultantWorkspace(unboundAffiliate, [candidate])?.accountId, "account-1");
  assert.equal(findAffiliateConsultantWorkspace(
    unboundAffiliate,
    [candidate, workspace({ clerkUserId: "another_user", accountId: "account-2" })],
  ), null);
  assert.equal(findAffiliateConsultantWorkspace(unboundAffiliate, [
    workspace({ accountIdentifierType: "hospital" }),
  ]), null);
});

test("workspace status comes from the linked consultant account's actual access window", () => {
  const now = new Date("2026-04-20T12:00:00.000Z");
  assert.deepEqual(getAffiliateWorkspaceReport(affiliate, [workspace()], now), {
    workspaceAccessStatus: "Trial",
    workspaceAccessEndDate: new Date("2026-05-01T12:00:00.000Z"),
    restorationDeadline: new Date("2026-05-31T12:00:00.000Z"),
  });

  const endedTrial = getAffiliateWorkspaceReport(affiliate, [workspace({
    trialEndsAt: new Date("2026-04-19T12:00:00.000Z"),
  })], now);
  assert.equal(endedTrial.workspaceAccessStatus, "Trial ended");

  const scheduledCancel = getAffiliateWorkspaceReport(affiliate, [workspace({
    subscriptionStatus: "active",
    trialEndsAt: null,
    subscriptionCancelAtPeriodEnd: true,
    subscriptionCurrentPeriodEnd: new Date("2026-05-01T12:00:00.000Z"),
  })], now);
  assert.equal(scheduledCancel.workspaceAccessStatus, "Canceled (period end)");
  assert.equal(scheduledCancel.workspaceAccessEndDate?.toISOString(), "2026-05-01T12:00:00.000Z");

  const noWorkspace = getAffiliateWorkspaceReport(affiliate, [], now);
  assert.equal(noWorkspace.workspaceAccessStatus, "No linked workspace");
  assert.equal(noWorkspace.workspaceAccessEndDate, null);
});

test("0% restoration deadline is rateEffectiveAt plus sixty days, independent of referral activity", () => {
  assert.equal(
    affiliateRestorationDeadline(0, new Date("2026-04-01T12:00:00.000Z"))?.toISOString(),
    "2026-05-31T12:00:00.000Z",
  );
  assert.equal(affiliateRestorationDeadline(10, new Date("2026-04-01T12:00:00.000Z")), null);
  assert.equal(affiliateRestorationDeadline(0, null), null);
});

test("admin affiliate JSON and CSV routes both use the shared workspace and restoration derivation", () => {
  const routes = readFileSync(new URL("../routes/admin.ts", import.meta.url), "utf8");
  const jsonRoute = routes.slice(routes.indexOf('router.get("/affiliates"'), routes.indexOf('router.get("/affiliates/download"'));
  const csvRoute = routes.slice(routes.indexOf('router.get("/affiliates/download"'), routes.indexOf('// ─── Token usage by account'));
  assert.match(jsonRoute, /getAffiliateWorkspaceReport\(/);
  assert.match(jsonRoute, /workspaceReport\.workspaceAccessStatus/);
  assert.match(jsonRoute, /workspaceReport\.workspaceAccessEndDate/);
  assert.match(jsonRoute, /workspaceReport\.restorationDeadline/);
  assert.match(csvRoute, /getAffiliateWorkspaceReport\(/);
  assert.match(csvRoute, /workspaceReport\.workspaceAccessStatus/);
  assert.match(csvRoute, /workspaceReport\.workspaceAccessEndDate/);
  assert.match(csvRoute, /workspaceReport\.restorationDeadline/);
});