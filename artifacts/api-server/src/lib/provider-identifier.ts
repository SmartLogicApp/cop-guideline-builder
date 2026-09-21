/**
 * What identifies an account.
 *
 * Every account carries exactly one identifier, and it is required and unique.
 * That is what makes "one subscription per account" enforceable: the register
 * endpoint looks an account up by it, so two people at the same organisation
 * join the same account instead of creating two subscriptions.
 *
 * Originally that identifier could only be a CMS Certification Number, which
 * meant only certified facilities could register at all. A physician practice
 * has an NPI and no CCN; an independent lab has a CLIA number; a compliance
 * consultant has neither. This module keeps the single-required-identifier rule
 * while letting the identifier be whichever one the buyer actually has.
 *
 * Making the column nullable instead would have looked simpler and been wrong:
 * in SQL a NULL never equals a NULL, so the get-or-create lookup would miss
 * every time and mint a fresh account — and a fresh subscription — on each
 * sign-in. A consultant therefore gets a generated identifier rather than none.
 */

import { randomInt } from "node:crypto";

export const IDENTIFIER_TYPES = ["ccn", "npi", "clia", "consultant"] as const;
export type IdentifierType = (typeof IDENTIFIER_TYPES)[number];

export const DEFAULT_IDENTIFIER_TYPE: IdentifierType = "ccn";

export function isIdentifierType(value: unknown): value is IdentifierType {
  return typeof value === "string"
    && (IDENTIFIER_TYPES as readonly string[]).includes(value);
}

/** Accepts the stored type or falls back to CCN, which is what every pre-existing row is. */
export function coerceIdentifierType(value: unknown): IdentifierType {
  return isIdentifierType(value) ? value : DEFAULT_IDENTIFIER_TYPE;
}

export function normalizeIdentifier(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

// ── Per-type format rules ────────────────────────────────────────────────────

/**
 * NPI check digit, per the CMS specification: Luhn over "80840" + the first
 * nine digits. Worth doing — a mistyped NPI that passes a length check only
 * fails later, in Stripe metadata or a support email.
 */
export function npiCheckDigit(firstNine: string): number {
  const base = `80840${firstNine}`;
  let sum = 0;
  let double = true; // the rightmost digit of `base` is doubled
  for (let i = base.length - 1; i >= 0; i -= 1) {
    let digit = base.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidNpi(identifier: string): boolean {
  if (!/^\d{10}$/.test(identifier)) return false;
  return npiCheckDigit(identifier.slice(0, 9)) === Number(identifier[9]);
}

/** CLIA numbers are ten characters: two digits, a letter, then seven digits. */
export function isValidClia(identifier: string): boolean {
  return /^\d{2}[A-Z]\d{7}$/.test(identifier);
}

/** ASC certification numbers are ten characters; every other CCN is six. */
export function isValidCcn(identifier: string, institutionType?: string): boolean {
  if (institutionType === "asc") return /^[A-Z0-9]{10}$/.test(identifier);
  return /^[A-Z0-9]{6}$/.test(identifier);
}

export const CONSULTANT_PREFIX = "CONS-";
const CONSULTANT_BODY = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;

export function isValidConsultantIdentifier(identifier: string): boolean {
  return identifier.startsWith(CONSULTANT_PREFIX)
    && CONSULTANT_BODY.test(identifier.slice(CONSULTANT_PREFIX.length));
}

export function isValidIdentifier(
  type: IdentifierType,
  identifier: string,
  institutionType?: string,
): boolean {
  switch (type) {
    case "npi":        return isValidNpi(identifier);
    case "clia":       return isValidClia(identifier);
    case "consultant": return isValidConsultantIdentifier(identifier);
    case "ccn":
    default:           return isValidCcn(identifier, institutionType);
  }
}

export function identifierError(
  type: IdentifierType,
  institutionType?: string,
): string {
  switch (type) {
    case "npi":
      return "NPI must be 10 digits and pass its check digit. Check for a transposed pair.";
    case "clia":
      return "CLIA number must be 10 characters: two digits, a letter, then seven digits (for example 12D3456789).";
    case "consultant":
      return "A consultant account identifier is issued automatically and cannot be entered by hand.";
    case "ccn":
    default:
      return institutionType === "asc"
        ? "ASC CMS Certification Number must be exactly 10 alphanumeric characters"
        : "CCN must be exactly 6 alphanumeric characters";
  }
}

/** What to call it in the interface and in support email. */
export function identifierLabel(type: IdentifierType): string {
  switch (type) {
    case "npi":        return "NPI";
    case "clia":       return "CLIA number";
    case "consultant": return "Account identifier";
    case "ccn":
    default:           return "CMS Certification Number";
  }
}

/** Only a CCN can be checked against CMS Care Compare. */
export function supportsCmsLookup(type: IdentifierType): boolean {
  return type === "ccn";
}

// ── Consultant identifiers ───────────────────────────────────────────────────

// No 0/1/I/O — these get read aloud and retyped in support conversations.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * Generates an identifier for a buyer who has none. The caller must treat a
 * unique-constraint violation as a collision and try again; at 32^8 that is
 * vanishingly rare, but the database, not this function, is the arbiter.
 */
export function generateConsultantIdentifier(): string {
  let body = "";
  for (let i = 0; i < 8; i += 1) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `${CONSULTANT_PREFIX}${body}`;
}
