import {
  containsSensitiveFinancialData as containsExistingSensitiveData,
  containsSensitiveFinancialNumber as containsExistingSensitiveNumber,
  redactSensitiveFinancialData as redactExistingSensitiveData,
} from "./sensitive-financial-text.ts";

// Extend (rather than replace) the existing free-text detector. A label such
// as "-ref" must not make a financial number safe to store or return.
const SUFFIXED_NUMBER_SOURCE = String.raw`(?<![A-Za-z0-9])(?:(?:\d{3,4}[- ]+){2,4}\d{2,4}|\d{4}[- ]+\d{4}|\d{9,17})(?=-[A-Za-z])`;
const SUFFIXED_NUMBER = new RegExp(SUFFIXED_NUMBER_SOURCE);
const SUFFIXED_NUMBER_GLOBAL = new RegExp(SUFFIXED_NUMBER_SOURCE, "g");
const REDACTED = "[redacted financial number]";

export function containsSensitiveFinancialNumber(value: string): boolean {
  return containsExistingSensitiveNumber(value) || SUFFIXED_NUMBER.test(value);
}

export function containsSensitiveFinancialData(value: unknown): boolean {
  if (containsExistingSensitiveData(value)) return true;
  if (typeof value === "string") return SUFFIXED_NUMBER.test(value);
  if (Array.isArray(value)) return value.some(containsSensitiveFinancialData);
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, item]) =>
      containsSensitiveFinancialNumber(key) || containsSensitiveFinancialData(item));
  }
  return false;
}

export function redactSensitiveFinancialData<T>(value: T): T {
  if (typeof value === "string") {
    return redactExistingSensitiveData(value).replace(SUFFIXED_NUMBER_GLOBAL, REDACTED) as T;
  }
  if (typeof value === "number" && containsSensitiveFinancialData(value)) return REDACTED as T;
  if (Array.isArray(value)) return value.map(redactSensitiveFinancialData) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      containsSensitiveFinancialNumber(key) ? REDACTED : key,
      redactSensitiveFinancialData(item),
    ])) as T;
  }
  return value;
}

export function hasSensitiveContact(contact: { email?: unknown; phone?: unknown }): boolean {
  return [contact.email, contact.phone].some(
    (value) => typeof value === "string" && containsSensitiveFinancialNumber(value),
  );
}

export function isSafeAffiliateIdentifier(value: string): boolean {
  return !containsSensitiveFinancialNumber(value);
}

export function isSafeDocumentVersion(value: unknown): value is string {
  return typeof value === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)
    && isSafeAffiliateIdentifier(value);
}

export function isSafeEmailTemplateKey(value: unknown): value is string {
  return typeof value === "string"
    && /^[a-z][a-z0-9_]{2,63}$/.test(value)
    && isSafeAffiliateIdentifier(value);
}

// Approval audits already record the affiliate ID. Do not repeat the code in
// a persistent note, even when the code passes the input guard.
export function approvalRateChangeNote(): string {
  return "Approved; referral code assigned.";
}