import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";

const requestedDatabase = process.env.TOKEN_USAGE_BACKFILL_DATABASE?.trim();
if (!requestedDatabase) {
  throw new Error(
    "Refusing to run: set TOKEN_USAGE_BACKFILL_DATABASE to the exact development database name.",
  );
}

try {
  const identity = await db.execute<{ databaseName: string }>(
    sql`SELECT current_database() AS "databaseName"`,
  );
  const currentDatabase = identity.rows[0]?.databaseName;
  if (!currentDatabase || currentDatabase !== requestedDatabase) {
    throw new Error(
      `Refusing to run: connected database "${currentDatabase ?? "unknown"}" does not match the explicitly allowed development database.`,
    );
  }
  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      "Refusing to run outside NODE_ENV=development. This script must never be used against production.",
    );
  }

  const result = await db.execute(sql`
    WITH unambiguous_memberships AS (
      SELECT
        clerk_user_id,
        (ARRAY_AGG(DISTINCT account_id))[1] AS account_id
      FROM account_users
      WHERE account_id IS NOT NULL
      GROUP BY clerk_user_id
      HAVING COUNT(DISTINCT account_id) = 1
    )
    UPDATE token_usage AS usage
    SET account_id = memberships.account_id
    FROM unambiguous_memberships AS memberships
    WHERE usage.account_id IS NULL
      AND usage.clerk_user_id = memberships.clerk_user_id
  `);

  process.stdout.write(
    `Backfilled ${result.rowCount ?? 0} token usage row(s) in the verified development database "${currentDatabase}".\n`,
  );
} finally {
  await pool.end();
}