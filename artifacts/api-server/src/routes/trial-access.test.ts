import assert from "node:assert/strict";
import test from "node:test";
import {
  getTrialAccessView,
  TRIAL_ACCESS_VIEW,
} from "../../../../trial-access.js";

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