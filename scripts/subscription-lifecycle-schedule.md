# Subscription lifecycle schedule handoff

**Staged instructions only — no Scheduled Deployment is active.** This runner is `scripts/run-subscription-lifecycle-cron.mjs`.

Create a **separate Node.js 24 Scheduled Deployment/runner**; do not switch the CMS API deployment from Autoscale to Scheduled. The CMS deployment must remain available to serve this HTTP endpoint; a scheduled job runs to completion instead of serving the API.

- **Schedule:** `0 9 * * *` (09:00 UTC daily)
- **Run command:** `node scripts/run-subscription-lifecycle-cron.mjs`
- **Production environment:** `CMS_BASE_URL=https://cmscomplianceguardian.com`
- **Production secret:** Set `CRON_SECRET` securely in both the Scheduled Deployment and the CMS API’s Production environment, using the same secret value. Never place the value in source, command arguments, or logs. Do not use `SESSION_SECRET`.
- **Timeout:** optional `CRON_TIMEOUT_MS`; defaults to 600000 ms (10 minutes), maximum 900000 ms (15 minutes).

## After publishing the separate schedule

Verify the first scheduled run completes with exit code `0` and a success summary (`ok: true`, HTTP 200, `failedAccountCount: 0`). A partial or failed sweep exits nonzero; review the run status and correct the issue before considering the schedule operational. The runner intentionally does not print response bodies or secrets. Do not trigger an ad hoc run unless an owner approves its lifecycle/email side effects.