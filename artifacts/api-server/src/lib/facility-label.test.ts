import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { FACILITY_LABEL_MAX, readFacilityLabel } from "./facility-label.ts";

test("a normal facility name is kept, tidied", () => {
  assert.equal(
    readFacilityLabel({ facilityLabel: "  Mercy   General  Hospital " }),
    "Mercy General Hospital",
  );
});

test("anything that is not a usable string records null", () => {
  // This value is written to the database on every generation. It must never
  // be the reason a customer's document fails, so every bad shape degrades to
  // null rather than throwing or rejecting the request.
  for (const body of [
    undefined,
    null,
    "not an object",
    {},
    { facilityLabel: "" },
    { facilityLabel: "   " },
    { facilityLabel: 42 },
    { facilityLabel: null },
    { facilityLabel: ["Mercy"] },
    { facilityLabel: { name: "Mercy" } },
  ]) {
    assert.equal(readFacilityLabel(body), null, `expected null for ${JSON.stringify(body)}`);
  }
});

test("an oversized label is truncated, not rejected", () => {
  const long = "A".repeat(FACILITY_LABEL_MAX + 500);
  const result = readFacilityLabel({ facilityLabel: long });
  assert.equal(result?.length, FACILITY_LABEL_MAX);
});

test("recording a facility label never gates the generation", () => {
  // The label is observability. If reading it ever moved inside the request
  // validation, a malformed label would start failing real work — so assert
  // against the route source that it has not.
  const source = readFileSync(
    new URL("../routes/generate.ts", import.meta.url),
    "utf8",
  );
  const validationFailure = source.indexOf("Invalid generation request");
  const labelRead = source.indexOf("readFacilityLabel(req.body)");
  assert.ok(validationFailure >= 0, "expected the request-validation guard to exist");
  assert.ok(labelRead >= 0, "expected the facility label to be read in the route");
  assert.ok(
    labelRead > validationFailure,
    "the facility label must be read after request validation, never as part of it",
  );
  assert.doesNotMatch(
    source,
    /facilityLabel[^\n]*res\.status\(4\d\d\)/,
    "a bad facility label must not produce an error response",
  );
});
