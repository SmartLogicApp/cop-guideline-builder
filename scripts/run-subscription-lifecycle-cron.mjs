const endpointPath = "/api/billing/admin/cron/subscription-lifecycle";
const defaultTimeoutMs = 10 * 60 * 1_000;
const maximumTimeoutMs = 15 * 60 * 1_000;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required environment variable ${name} is not set.`);
  return value;
}

function getEndpoint() {
  const baseUrl = new URL(requiredEnv("CMS_BASE_URL"));
  if (
    baseUrl.protocol !== "https:" ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash ||
    !["", "/"].includes(baseUrl.pathname) ||
    ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(baseUrl.hostname) ||
    baseUrl.hostname.endsWith(".localhost") ||
    baseUrl.hostname.endsWith(".replit.dev")
  ) {
    throw new Error("CMS_BASE_URL must be the HTTPS origin of the published CMS, without a path or credentials.");
  }
  return new URL(endpointPath, baseUrl.origin);
}

function getTimeoutMs() {
  const configured = process.env.CRON_TIMEOUT_MS?.trim();
  if (!configured) return defaultTimeoutMs;
  const timeoutMs = Number(configured);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > maximumTimeoutMs) {
    throw new Error(`CRON_TIMEOUT_MS must be an integer between 1000 and ${maximumTimeoutMs}.`);
  }
  return timeoutMs;
}

async function run() {
  const secret = requiredEnv("CRON_SECRET");
  if (/[\r\n]/.test(secret)) throw new Error("CRON_SECRET contains invalid newline characters.");

  const endpoint = getEndpoint();
  const timeoutMs = getTimeoutMs();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      accept: "application/json",
    },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "error",
  });
  const body = await response.json().catch(() => null);
  const summaryFields = [
    "accountsScanned",
    "stripeAccountsProcessed",
    "trialReminderAccountsScanned",
    "trialRemindersSent",
    "warningCount",
  ];

  if (
    response.status !== 200 ||
    !body ||
    typeof body !== "object" ||
    body.ok !== true ||
    !Number.isInteger(body.failedAccountCount) ||
    body.failedAccountCount !== 0 ||
    summaryFields.some((field) => !Number.isInteger(body[field]) || body[field] < 0)
  ) {
    // Do not print response bodies: lifecycle failure details can contain
    // account identifiers and operational data. Keep the failure signal useful.
    throw new Error(`Subscription lifecycle cron failed (HTTP ${response.status}; success response required).`);
  }

  console.log(JSON.stringify({
    ok: true,
    completedAt: new Date().toISOString(),
    accountsScanned: body.accountsScanned,
    stripeAccountsProcessed: body.stripeAccountsProcessed,
    trialReminderAccountsScanned: body.trialReminderAccountsScanned,
    trialRemindersSent: body.trialRemindersSent,
    warningCount: body.warningCount,
  }));
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : "Unexpected subscription lifecycle cron failure.";
  console.error(message);
  process.exitCode = 1;
});