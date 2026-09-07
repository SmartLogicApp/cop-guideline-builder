import assert from "node:assert/strict";
import test from "node:test";
import {
  CMS_DATASETS,
  MANUAL_VERIFICATION_MESSAGE,
  MANUAL_VERIFICATION_TYPES,
  isValidProviderIdentifier,
  lookupCCN,
} from "./ccn-lookup.ts";

const automaticCases = [
  {
    type: "irf",
    id: "7t8x-u3ir",
    identifier: "013025",
    row: { cms_certification_number_ccn: "013025", provider_name: "Sample IRF", state: "AL", citytown: "Birmingham" },
  },
  {
    type: "asc",
    id: "4jcv-atw7",
    identifier: "05C0001831",
    row: { facility_id: "05C0001831", facility_name: "Sample ASC", state: "CA", citytown: "Vacaville" },
  },
  {
    type: "esrd",
    id: "23ew-n7w9",
    identifier: "012306",
    row: { cms_certification_number_ccn: "012306", facility_name: "Sample ESRD", state: "AL", citytown: "Birmingham" },
  },
] as const;

for (const fixture of automaticCases) {
  test(`${fixture.type} uses its CMS dataset and maps the provider`, async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fetchMock = async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), body: String(init?.body) });
      return new Response(JSON.stringify({ results: [fixture.row] }), { status: 200 });
    };

    const result = await lookupCCN(fixture.identifier, fixture.type, fetchMock as typeof fetch);

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, new RegExp(`/query/${fixture.id}/0$`));
    assert.equal(JSON.parse(calls[0].body).conditions[0].value, fixture.identifier);
    assert.equal(result.found, true);
    assert.equal(result.facilityType, fixture.type);
  });
}

test("ASC accepts its 10-character CMS identifier while other CCNs remain six characters", () => {
  assert.equal(isValidProviderIdentifier("05C0001831", "asc"), true);
  assert.equal(isValidProviderIdentifier("140001", "asc"), false);
  assert.equal(isValidProviderIdentifier("140001", "hospital"), true);
  assert.equal(isValidProviderIdentifier("05C0001831", "hospital"), false);
});

test("all explicitly manual provider types have the manual-review contract", () => {
  assert.deepEqual([...MANUAL_VERIFICATION_TYPES].sort(), ["cmhc", "corf", "fqhc", "opo", "xray"]);
  assert.match(MANUAL_VERIFICATION_MESSAGE, /reviewed manually/i);
});

test("provider-aware lookup does not query Care Compare for a manual type", async () => {
  let called = false;
  const result = await lookupCCN("123456", "corf", (async () => {
    called = true;
    throw new Error("must not be called");
  }) as typeof fetch);

  assert.equal(called, false);
  assert.equal(result.found, false);
  assert.equal(result.facilityType, "corf");
});

test("catalog contains every configured automatic source exactly once", () => {
  const ids = CMS_DATASETS.map((dataset) => dataset.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ["7t8x-u3ir", "4jcv-atw7", "23ew-n7w9"]) {
    assert.ok(ids.includes(id));
  }
});