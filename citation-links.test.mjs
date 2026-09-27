import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { citationToUrl } from "./citation-links.js";

test("eCFR section labels link to the exact section", () => {
  assert.equal(
    citationToUrl("§482.23 – Nursing Services"),
    "https://www.ecfr.gov/current/title-42/section-482.23",
  );
  assert.equal(
    citationToUrl("42 CFR § 485.635 — Provision of services"),
    "https://www.ecfr.gov/current/title-42/section-485.635",
  );
});

test("eCFR subsection labels link to the paragraph within the section", () => {
  assert.equal(
    citationToUrl("§482.13(e) – Restraint & Seclusion"),
    "https://www.ecfr.gov/current/title-42/section-482.13#p-482.13(e)",
  );
  assert.equal(
    citationToUrl("42 CFR § 482.13(e)(1) – Patient Rights"),
    "https://www.ecfr.gov/current/title-42/section-482.13#p-482.13(e)(1)",
  );
});

test("42 CFR part labels link to the part rather than an accreditor search", () => {
  assert.equal(
    citationToUrl("42 CFR 493 – CLIA"),
    "https://www.ecfr.gov/current/title-42/part-493",
  );
  assert.equal(
    citationToUrl("42 cfr 494 — ESRD Conditions"),
    "https://www.ecfr.gov/current/title-42/part-494",
  );
});

test("Joint Commission standard codes search for only the code", () => {
  assert.equal(
    citationToUrl("IC.01.01.01 – Infection Prevention"),
    "https://www.jointcommission.org/search/#q=IC.01.01.01",
  );
  assert.equal(
    citationToUrl("NPCP.01.01.01 — Psychiatric Patient Care"),
    "https://www.jointcommission.org/search/#q=NPCP.01.01.01",
  );
});

test("rendered citation links open the official source safely in a new tab", () => {
  const source = readFileSync(new URL("./index.jsx", import.meta.url), "utf8");
  const citationAnchor = source.match(/<a\b(?=[^>]*\bhref=\{citationToUrl\(c\)\})[^>]*>/s)?.[0];

  assert.ok(citationAnchor, "the citation URL builder must be used by a rendered anchor");
  assert.match(citationAnchor, /\btarget="_blank"/);
  assert.match(citationAnchor, /\brel="[^"]*\bnoopener\b[^"]*\bnoreferrer\b[^"]*"/);
});