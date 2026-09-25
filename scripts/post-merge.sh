#!/bin/bash
set -euo pipefail
pnpm install --frozen-lockfile

# drizzle-kit can exit 0 after a non-TTY prompt fails, leaving the schema
# unapplied. Never force a push: its proposed fix may truncate existing data.
push_log="$(mktemp)"
trap 'rm -f "$push_log"' EXIT
pnpm --filter @workspace/db run push 2>&1 | tee "$push_log"
if grep -Eiq "Interactive prompts require a TTY|Do you want to truncate|You're about to" "$push_log"; then
  echo "Database schema needs manual review; automatic post-merge push was not confirmed." >&2
  exit 1
fi
