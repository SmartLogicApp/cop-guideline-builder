import assert from "node:assert/strict";
import test from "node:test";
import {
  getScopedAccountAccess,
  getTrialAccessView,
  isPaymentSetupPending,
  TRIAL_ACCESS_VIEW,
} from "../../../../trial-access.js";

test("a newly registered direct account needs checkout, not an expired-trial message", () => {
  assert.equal(isPaymentSetupPending({ subscriptionStatus: "pending_payment", trialEndsAt: null }), true);
  assert.equal(isPaymentSetupPending({ subscriptionStatus: "trial", trialEndsAt: new Date(0) }), false);
  assert.equal(isPaymentSetupPending({ subscriptionStatus: "past_due" }), false);
});

for (const [firstActive, secondActive] of [[true, false], [false, true]]) {
  test(`${firstActive ? "active" : "expired"} to ${secondActive ? "active" : "expired"} account switch never borrows prior access`, () => {
    const first = {
      requestKey: "user_first",
      ownerId: "user_first",
      accountData: { clerkUserId: "user_first", isActive: firstActive, account: {} },
      status: "resolved" as const,
    };
    assert.equal(getScopedAccountAccess(first, "user_first").accountData?.isActive, firstActive);
    assert.deepEqual(getScopedAccountAccess(first, "user_second"), {
      ownerId: undefined, accountData: null, status: "loading",
    });
    // A failed reload cannot expose the previous user's result, whether it
    // completes before or after the new user's request starts.
    const failed = {
      requestKey: "user_second",
      ownerId: "user_second",
      accountData: null,
      status: "error" as const,
    };
    assert.deepEqual(getScopedAccountAccess(failed, "user_second"), {
      ownerId: "user_second", accountData: null, status: "error",
    });
    const second = {
      requestKey: "user_second",
      ownerId: "user_second",
      accountData: { clerkUserId: "user_second", isActive: secondActive, account: {} },
      status: "resolved" as const,
    };
    assert.equal(getScopedAccountAccess(second, "user_second").accountData?.isActive, secondActive);
    assert.equal(getScopedAccountAccess(second, "user_first").accountData, null);
    assert.equal(getScopedAccountAccess(second, undefined).status, "loading");
  });
}

test("a mismatched account response cannot grant or deny access", () => {
  const staleResponse = {
    requestKey: "user_second",
    ownerId: "user_second",
    accountData: { clerkUserId: "user_first", isActive: true },
    status: "resolved" as const,
  };
  assert.deepEqual(getScopedAccountAccess(staleResponse, "user_second"), {
    ownerId: undefined, accountData: null, status: "error",
  });
});

test("an expired trial with zero days remaining shows the end-state instead of the tool tabs", () => {
  assert.equal(
    getTrialAccessView({
      status: "trial",
      isActive: false,
      daysLeftInTrial: 0,
    }),
    TRIAL_ACCESS_VIEW.END_STATE,
  );
});

test("a missing subscription shows the end-state instead of the tool tabs", () => {
  assert.equal(
    getTrialAccessView(null),
    TRIAL_ACCESS_VIEW.END_STATE,
  );
});

test("an inactive subscription shows the end-state instead of the tool tabs", () => {
  assert.equal(
    getTrialAccessView({
      status: "canceled",
      isActive: false,
      daysLeftInTrial: 0,
    }),
    TRIAL_ACCESS_VIEW.END_STATE,
  );
});

test("an active paid subscription keeps the normal workspace and tool tabs visible", () => {
  assert.equal(
    getTrialAccessView({
      status: "active",
      isActive: true,
      daysLeftInTrial: 0,
    }),
    TRIAL_ACCESS_VIEW.WORKSPACE,
  );
});

test("an unresolved status after a temporary request failure fails open to the workspace", () => {
  assert.equal(
    getTrialAccessView(undefined),
    TRIAL_ACCESS_VIEW.WORKSPACE,
  );
});