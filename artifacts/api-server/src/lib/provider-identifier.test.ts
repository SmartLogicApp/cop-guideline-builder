import assert from "node:assert/strict";
import test from "node:test";

import {
  CONSULTANT_PREFIX,
  DEFAULT_IDENTIFIER_TYPE,
  IDENTIFIER_TYPES,
  coerceIdentifierType,
  generateConsultantIdentifier,
  identifierError,
  identifierLabel,
  isIdentifierType,
  isValidClia,
  isValidConsultantIdentifier,
  isValidIdentifier,
  isValidNpi,
  normalizeIdentifier,
  npiCheckDigit,
  supportsCmsLookup,
} from "./provider-identifier.ts";

test("CCN rules are unchanged: six characters, ten for an ASC", () => {
  assert.equal(isValidIdentifier("ccn", "140001", "hospital"), true);
  assert.equal(isValidIdentifier("ccn", "05C0001831", "asc"), true);
  // The two lengths must not be interchangeable, or an ASC could register
  // under a six-character number that belongs to a different facility.
  assert.equal(isValidIdentifier("ccn", "140001", "asc"), false);
  assert.equal(isValidIdentifier("ccn", "05C0001831", "hospital"), false);
});

test("NPI check digit matches the CMS specification", () => {
  // 1234567893 is the worked example in the CMS check-digit documentation.
  assert.equal(npiCheckDigit("123456789"), 3);
  assert.equal(isValidNpi("1234567893"), true);
});

test("NPI rejects the errors people actually make", () => {
  assert.equal(isValidNpi("1234567890"), false, "wrong check digit");
  assert.equal(isValidNpi("2134567893"), false, "transposed leading pair");
  assert.equal(isValidNpi("123456789"), false, "nine digits");
  assert.equal(isValidNpi("12345678931"), false, "eleven digits");
  assert.equal(isValidNpi("123456789A"), false, "letter in an all-digit field");
  assert.equal(isValidNpi(""), false);
});

test("CLIA numbers are two digits, a letter, then seven digits", () => {
  assert.equal(isValidClia("12D3456789"), true);
  assert.equal(isValidClia("45D0512345"), true);
  assert.equal(isValidClia("12D345678"), false, "nine characters");
  assert.equal(isValidClia("123456789D"), false, "letter in the wrong place");
  assert.equal(isValidClia("1234567890"), false, "no letter at all");
});

test("a consultant identifier cannot be supplied by hand", () => {
  // The register endpoint ignores client input for this type; the validator
  // backs that up so a hand-typed value can never pass.
  const issued = generateConsultantIdentifier();
  assert.equal(isValidConsultantIdentifier(issued), true);
  assert.equal(isValidConsultantIdentifier("CONS-AAAAAAAA"), true);
  assert.equal(isValidConsultantIdentifier("140001"), false);
  assert.equal(isValidConsultantIdentifier("CONS-SHORT"), false);
  assert.equal(
    isValidConsultantIdentifier("CONS-AAAAAAA0"),
    false,
    "zero is excluded so the identifier survives being read aloud",
  );
});

test("issued consultant identifiers are well formed and not repeated", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i += 1) {
    const id = generateConsultantIdentifier();
    assert.ok(id.startsWith(CONSULTANT_PREFIX));
    assert.equal(id.length, CONSULTANT_PREFIX.length + 8);
    assert.equal(isValidConsultantIdentifier(id), true);
    // Only the random body is checked. The "CONS-" prefix contains an O, but
    // it is a fixed, pronounceable word rather than a character someone has to
    // guess at — the ambiguity that matters is in the random part.
    assert.doesNotMatch(
      id.slice(CONSULTANT_PREFIX.length),
      /[01IO]/,
      "ambiguous characters must stay out of the random body",
    );
    seen.add(id);
  }
  // Not a uniqueness guarantee — the database's unique constraint is that —
  // but 500 collisions-free draws catch a generator stuck on one value.
  assert.equal(seen.size, 500);
});

test("normalizing an identifier tolerates how people type", () => {
  assert.equal(normalizeIdentifier("  14 0001 "), "140001");
  assert.equal(normalizeIdentifier("05c0001831"), "05C0001831");
});

test("only a CCN can be checked against CMS Care Compare", () => {
  assert.equal(supportsCmsLookup("ccn"), true);
  assert.equal(supportsCmsLookup("npi"), false);
  assert.equal(supportsCmsLookup("clia"), false);
  assert.equal(supportsCmsLookup("consultant"), false);
});

test("unknown identifier types fall back to CCN rather than throwing", () => {
  // Rows written before identifier_type existed read back as the default.
  assert.equal(coerceIdentifierType(undefined), DEFAULT_IDENTIFIER_TYPE);
  assert.equal(coerceIdentifierType("something-else"), "ccn");
  assert.equal(coerceIdentifierType("npi"), "npi");
  assert.equal(isIdentifierType("npi"), true);
  assert.equal(isIdentifierType("facility"), false);
});

test("every identifier type has a label and an error message", () => {
  for (const type of IDENTIFIER_TYPES) {
    assert.ok(identifierLabel(type).length > 0, `${type} needs a label`);
    assert.ok(identifierError(type).length > 0, `${type} needs an error message`);
  }
  assert.match(identifierError("ccn", "asc"), /10 alphanumeric/);
  assert.match(identifierError("ccn", "hospital"), /6 alphanumeric/);
});
