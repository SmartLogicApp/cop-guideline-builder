/** Free-text boundary only. Tax/account details belong in Stripe, not application records. */
// Match SSN/EIN formatting or uninterrupted full-length IDs, not dates/years.
const FINANCIAL_NUMBER_PATTERN = String.raw`(?<!\d)(?:\d{3}[- .]\d{2}[- .]\d{4}|\d{2}[- .]\d{7})(?!\d)|(?<![A-Za-z0-9-])(?:\d{4}[- ]+\d{4}|(?:\d{3,4}[- ]+){2,4}\d{2,4}|\d{9,17})(?![A-Za-z0-9-])`;
const SENSITIVE_NUMBER = new RegExp(FINANCIAL_NUMBER_PATTERN);
const SENSITIVE_NUMBER_GLOBAL = new RegExp(FINANCIAL_NUMBER_PATTERN, "g");
const REDACTED = "[redacted financial number]";

export function containsSensitiveFinancialNumber(value: string): boolean {
  return SENSITIVE_NUMBER.test(value);
}

/** Inspect values, not serialized JSON: numbers split across JSON keys must not evade checks. */
export function containsSensitiveFinancialData(value: unknown): boolean {
  if (typeof value === "string") return containsSensitiveFinancialNumber(value);
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 100_000_000;
  if (Array.isArray(value)) return value.some(containsSensitiveFinancialData);
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, item]) =>
      containsSensitiveFinancialNumber(key) || containsSensitiveFinancialData(item));
  }
  return false;
}

/** Do not expose older records while they await an owner-approved remediation. */
export function redactSensitiveFinancialData<T>(value: T): T {
  if (typeof value === "string") return value.replace(SENSITIVE_NUMBER_GLOBAL, REDACTED) as T;
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