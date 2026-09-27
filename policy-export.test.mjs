import assert from "node:assert/strict";
import test from "node:test";
import { policySourceRows, policyToTxt } from "./policy-export.mjs";

test("live eCFR policy TXT and Excel retain the retrieval date", () => {
  const source = { kind: "ecfr", fetchDate: "2026-09-25" };
  const text = policyToTxt("POLICY TITLE\n\nREFERENCES\n42 CFR §482.12\n", source);
  assert.match(text, /42 CFR §482\.12\n\nCMS regulatory citations sourced from live eCFR as of 2026-09-25\.\n$/);
  assert.deepEqual(policySourceRows(source), [{
    "Source Kind": "Live eCFR",
    "Retrieval Date": "2026-09-25",
    "Source Note": "CMS regulatory citations sourced from live eCFR as of 2026-09-25.",
  }]);
});

test("AI-knowledge policy downloads are not attributed to live eCFR", () => {
  for (const source of [{ kind: "ai" }, null]) {
    assert.equal(policyToTxt("POLICY TITLE", source), "POLICY TITLE\n\nSource: AI Knowledge.\n");
    assert.deepEqual(policySourceRows(source), [{
      "Source Kind": "AI Knowledge",
      "Retrieval Date": "",
      "Source Note": "Source: AI Knowledge.",
    }]);
  }
});