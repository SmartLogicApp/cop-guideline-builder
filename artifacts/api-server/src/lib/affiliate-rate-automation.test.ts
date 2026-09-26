import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  activityWindow,
  type ActivityClockInput,
} from "./affiliate-commission.ts";
import {
  AFFILIATE_RATE_NOTICE_LEAD_DAYS,
  affiliateRateNoticeCandidates,
  affiliateRateNoticeEmail,
  applyPendingAffiliateRateReductions,
  dueAffiliateRateNotices,
  isAffiliateRateNoticeDue,
} from "./affiliate-rate-automation.ts";

const clock: ActivityClockInput = {
  currentRatePct: 20,
  lastQualifyingReferralAt: null,
  rateEffectiveAt: new Date("2026-01-01T00:00:00.000Z"),
};

function utcDateDaysBefore(date: Date, days: number): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - days,
    12,
  ));
}

test("a late inactivity application persists both reductions in order and preserves each effective date", async () => {
  const persisted: Array<[number, number, string]> = [];
  const reductions = await applyPendingAffiliateRateReductions(
    clock,
    new Date("2029-01-01T00:00:00.000Z"),
    async (reduction) => {
      persisted.push([
        reduction.fromPct,
        reduction.toPct,
        reduction.effectiveAt.toISOString(),
      ]);
    },
  );

  assert.deepEqual(reductions.map(({ fromPct, toPct }) => [fromPct, toPct]), [[20, 10], [10, 0]]);
  assert.deepEqual(persisted, reductions.map(({ fromPct, toPct, effectiveAt }) => [
    fromPct,
    toPct,
    effectiveAt.toISOString(),
  ]));
  assert.notEqual(persisted[0]?.[2], persisted[1]?.[2]);
});

test("activity and grace notices are each due on the UTC calendar day 15 days before their deadlines", () => {
  assert.equal(AFFILIATE_RATE_NOTICE_LEAD_DAYS, 15);
  const [activity, grace] = affiliateRateNoticeCandidates(clock);
  assert.ok(activity);
  assert.ok(grace);

  const activityNoticeDay = utcDateDaysBefore(activity.deadlineAt, 15);
  const graceNoticeDay = utcDateDaysBefore(grace.deadlineAt, 15);
  assert.deepEqual(
    dueAffiliateRateNotices(clock, activityNoticeDay).map(({ type }) => type),
    ["activity-period"],
  );
  assert.deepEqual(
    dueAffiliateRateNotices(clock, graceNoticeDay).map(({ type }) => type),
    ["grace-period"],
  );
  assert.deepEqual(dueAffiliateRateNotices(clock, utcDateDaysBefore(activity.deadlineAt, 14)), []);
  assert.equal(isAffiliateRateNoticeDue(activity.deadlineAt, activityNoticeDay), true);
  assert.equal(isAffiliateRateNoticeDue(activity.deadlineAt, utcDateDaysBefore(activity.deadlineAt, 16)), false);
});

test("10% notices describe the 10-to-0 next step, while zero-rate notices describe the restoration deadline", () => {
  const tenPercent: ActivityClockInput = { ...clock, currentRatePct: 10 };
  const tenPercentGrace = affiliateRateNoticeCandidates(tenPercent).find(({ type }) => type === "grace-period");
  assert.ok(tenPercentGrace);
  assert.equal(tenPercentGrace.nextRatePct, 0);
  assert.match(affiliateRateNoticeEmail(tenPercentGrace).text, /decrease from 10% to 0%/);

  const zeroRate: ActivityClockInput = {
    ...clock,
    currentRatePct: 0,
    rateEffectiveAt: new Date("2026-03-01T00:00:00.000Z"),
  };
  const [restoration] = affiliateRateNoticeCandidates(zeroRate);
  assert.equal(restoration?.type, "zero-restoration-window");
  assert.equal(restoration?.deadlineAt.toISOString(), "2026-04-30T00:00:00.000Z");
  assert.deepEqual(dueAffiliateRateNotices(zeroRate, utcDateDaysBefore(restoration!.deadlineAt, 15)).map(({ type }) => type), [
    "zero-restoration-window",
  ]);
  assert.match(affiliateRateNoticeEmail(restoration!).text, /requires administrator approval/);
});

test("the cron route locks each affiliate row, audits transitions, and uses durable unique notice claims", async () => {
  const routes = await readFile(new URL("../routes/affiliates.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../../../../lib/db/src/schema/affiliates.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../../../../lib/db/migrations/0006_affiliate_rate_notice_deliveries.sql", import.meta.url), "utf8");

  assert.match(routes, /router\.post\("\/cron\/rate-reductions", requireCronOrSuperAdmin/);
  assert.match(routes, /from\("\/cron\/rate-reductions"|from\(affiliates\)[\s\S]*?\.for\("update"\)/);
  assert.match(routes, /reason: "inactivity"/);
  assert.match(routes, /onConflictDoNothing\(\)\.returning/);
  assert.match(routes, /affiliateRateNoticeDeliveries\.sentAt/);
  assert.match(schema, /uniqueIndex\("affiliate_rate_notice_deliveries_key"\)/);
  assert.match(migration, /UNIQUE \(affiliate_id, notice_type, deadline_at\)/);
});

test("v4 automation and manual accrual fail closed on canonical publication and current acceptance", async () => {
  const routes = await readFile(new URL("../routes/affiliates.ts", import.meta.url), "utf8");

  assert.match(routes, /AFFILIATE_REVIEWED_TERMS_VERSION\?\.trim\(\) !== AFFILIATE_AGREEMENT_V4_VERSION/);
  assert.match(routes, /published\.body !== canonicalBody \|\| published\.contentSha256 !== contentSha256/);
  assert.match(routes, /eq\(affiliateAgreementAcceptances\.agreementVersion, AFFILIATE_AGREEMENT_V4_VERSION\)/);
  assert.match(routes, /eq\(affiliateAgreementAcceptances\.signerEmail, sql`lower\(\$\{email\}\)`\)/);
  assert.match(routes, /eq\(affiliateAgreementAcceptances\.identityEpoch, identityEpoch\)/);
  assert.match(routes, /if \(!activation\.active\)[\s\S]*?v4AutomationActive: false/);

  const manualRoute = routes.slice(
    routes.indexOf('router.post("/:id/commissions", requireSuperAdmin'),
    routes.indexOf("// ─── POST /api/affiliates/cron/maturity-sweep"),
  );
  assert.match(manualRoute, /await getAffiliateV4Activation\(\)/);
  assert.match(manualRoute, /hasCurrentAffiliateV4Acceptance\(/);
  assert.match(manualRoute, /AFFILIATE_V4_ACCEPTANCE_REQUIRED/);
});

test("notice retries compare their saved tuple against the current affiliate clock and scheduler state is surfaced", async () => {
  const routes = await readFile(new URL("../routes/affiliates.ts", import.meta.url), "utf8");

  assert.match(routes, /candidate\.type === expectedCandidate\.type[\s\S]*?candidate\.deadlineAt\.getTime\(\) === expectedCandidate\.deadlineAt\.getTime\(\)[\s\S]*?candidate\.currentRatePct === expectedCandidate\.currentRatePct[\s\S]*?candidate\.nextRatePct === expectedCandidate\.nextRatePct/);
  assert.match(routes, /isRetry \? candidate\.deadlineAt > now : isAffiliateRateNoticeDue/);
  assert.match(routes, /noticesSkippedStaleRetry: noticeResult\.skippedStaleRetry/);
  assert.match(routes, /AFFILIATE_RATE_AUTOMATION_SCHEDULER_CONFIGURED === "true"/);
  assert.match(routes, /no configured daily scheduler/);
  assert.match(routes, /exactly[\s\S]*?15 days before the deadline/);
});