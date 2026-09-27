import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test, { mock } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";

// Invoke the registered middleware and handlers, without opening a network
// listener or connecting to a production database.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".")) {
      const candidates = specifier.endsWith(".js")
        ? [specifier.slice(0, -3) + ".ts", specifier]
        : [specifier, `${specifier}/index.ts`, `${specifier}.ts`];
      for (const candidate of candidates) {
        try { return nextResolve(candidate, context); } catch { /* try next candidate */ }
      }
    }
    return nextResolve(specifier, context);
  },
});
process.env.DATABASE_URL = "postgresql://test:test@localhost:1/disconnected";
process.env.ADMIN_CLERK_USER_IDS = "synthetic-terms-admin";

const [{ default: accountRouter }, { default: billingRouter }, { default: adminRouter }, schema, terms] =
  await Promise.all([
    import("./accounts.ts"),
    import("./billing.ts"),
    import("./admin.ts"),
    import("@workspace/db"),
    import("../lib/terms-versions.ts"),
  ]);
const { db, accounts, accountUsers, adminUsers, tokenUsage, termsAcceptances } = schema;
const { CURRENT_TERMS_VERSION } = terms;

type Route = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] } };
function route(router: unknown, method: string, path: string) {
  const layer = (router as { stack: Route[] }).stack.find(
    (item) => item.route?.path === path && item.route.methods[method],
  );
  assert.ok(layer?.route, `${method.toUpperCase()} ${path} is registered`);
  return layer.route;
}

async function request(
  router: unknown, method: string, path: string,
  userId: string | null, body: Record<string, unknown> = {},
) {
  const stack = route(router, method, path).stack;
  const auth = Object.assign(() => ({ userId, tokenType: "session_token" }), {
    [Symbol.for("@clerk/express.auth")]: true,
  });
  const req = { auth, body, query: {}, ip: "192.0.2.10", get: (header: string) =>
    header === "user-agent" ? "Terms route test" : undefined };
  let status = 200;
  let payload: any;
  let headers: Record<string, string> = {};
  const res = {
    status(code: number) { status = code; return this; },
    setHeader(name: string, value: string) { headers[name] = value; return this; },
    json(value: unknown) {
      // Express serializes Dates before returning JSON to clients.
      payload = JSON.parse(JSON.stringify(value));
      return this;
    },
  };
  for (const layer of stack) {
    let nextCalled = false;
    await new Promise<void>((resolve, reject) => {
      try {
        const result = layer.handle(req, res, (error?: unknown) => {
          if (error) reject(error);
          else { nextCalled = true; resolve(); }
        });
        if (result && typeof result.then === "function") result.then(resolve, reject);
        else if (layer.handle.length < 3 || !nextCalled && payload !== undefined) resolve();
      } catch (error) { reject(error); }
    });
    if (!nextCalled) break;
  }
  return { status, body: payload, headers };
}

test("Terms acceptance is authenticated, registered, server-timed and cannot be overwritten", async () => {
  // Test the live published version rather than locking this test to a
  // version that will legitimately change at the next Terms publication.
  assert.equal(terms.isAcceptableVersion(CURRENT_TERMS_VERSION), true);
  let registered = false;
  let account: Record<string, any> = {
    id: "synthetic-facility", facilityName: "Example Facility",
    termsVersion: null, termsAcceptedAt: null, subscriptionStatus: "active",
    trialEndsAt: null,
  };
  const history: Record<string, any>[] = [];
  let updateCount = 0;
  const dialect = new PgDialect();
  const selects = mock.method(db, "select", () => ({
    from(table: unknown) {
      const read = (joined = false, allowed = true): any => ({
        where: (condition: any) => {
          const params = dialect.sqlToQuery(condition).params;
          // The membership read must be scoped to the authenticated Clerk user.
          const permitted = table !== accountUsers || params.includes("synthetic-member");
          return read(joined, permitted);
        },
        orderBy: () => read(joined),
        leftJoin: () => read(true),
        limit: async () => {
          if (table === accountUsers) {
            return joined
              ? registered && allowed ? [{ accountUser: { accountId: account.id }, account }] : []
              : registered && allowed ? [{ accountId: account.id }] : [];
          }
          if (table === accounts) return registered ? [account] : [];
          if (table === adminUsers) return [];
          if (table === tokenUsage) return [];
          throw new Error("Unexpected select table");
        },
        then(resolve: (value: any[]) => void) {
          resolve(table === accounts ? registered ? [account] : []
            : table === accountUsers ? registered && allowed ? [{ accountId: account.id }] : []
            : []);
        },
      });
      return read();
    },
  }) as unknown as typeof db.select);
  const inserts = mock.method(db, "insert", (table: unknown) => {
    assert.equal(table, termsAcceptances);
    return { values(value: Record<string, any>) { history.push(value); return Promise.resolve(); } };
  });
  const updates = mock.method(db, "update", (table: unknown) => {
    assert.equal(table, accounts);
    return {
      set(value: Record<string, any>) {
        return {
          where(condition: any) {
            assert.ok(condition, "account and version guard must be supplied");
            const query = dialect.sqlToQuery(condition);
            assert.match(query.sql, /terms_version.*is null/i);
            assert.match(query.sql, /terms_version.*<>/i);
            assert.ok(query.params.includes(account.id));
            assert.ok(query.params.includes(CURRENT_TERMS_VERSION));
            return {
              returning: async () => {
                updateCount++;
                assert.equal(account.termsVersion, null);
                account = { ...account, ...value };
                return [{
                  termsAcceptedAt: account.termsAcceptedAt,
                  termsVersion: account.termsVersion,
                }];
              },
            };
          },
        };
      },
    };
  });

  try {
    const submit = (userId: string | null, body: Record<string, unknown>) =>
      request(accountRouter, "post", "/terms-acceptance", userId, body);
    const valid = { termsVersion: CURRENT_TERMS_VERSION };
    const signedOut = await submit(null, valid);
    assert.equal(signedOut.status, 401);
    assert.equal(selects.mock.callCount(), 0);
    assert.equal((await submit("synthetic-member", valid)).status, 409);
    assert.equal(history.length, 0);

    registered = true;
    assert.equal((await submit("another-user", valid)).status, 409);
    for (const version of ["2026-08-13", "2026-09-21", "2.0", "not-a-version"]) {
      const rejected = await submit("synthetic-member", { termsVersion: version });
      assert.equal(rejected.status, 400, version);
      assert.equal(rejected.body.currentVersion, CURRENT_TERMS_VERSION);
    }
    assert.equal(history.length, 0);
    const before = Date.now();
    const first = await submit("synthetic-member", {
      ...valid, acceptedAt: "2000-01-01T00:00:00.000Z",
    });
    const after = Date.now();
    assert.equal(first.status, 201);
    assert.equal(first.body.recorded, true);
    const receipt = new Date(first.body.termsAcceptedAt).getTime();
    assert.ok(receipt >= before && receipt <= after, "receipt comes from server time");
    assert.equal(first.body.termsVersion, CURRENT_TERMS_VERSION);
    assert.equal(history.length, 1);
    assert.equal(history[0].clerkUserId, "synthetic-member");
    assert.equal(history[0].accountId, account.id);
    assert.equal(history[0].termsVersion, CURRENT_TERMS_VERSION);
    assert.equal(history[0].acceptedAt.toISOString(), first.body.termsAcceptedAt);

    const second = await submit("synthetic-member", {
      ...valid, acceptedAt: "2099-01-01T00:00:00.000Z",
    });
    assert.equal(second.status, 200);
    assert.deepEqual(second.body, { ...first.body, recorded: false });
    assert.equal(history.length, 1, "repeat request cannot append evidence");
    assert.equal(updateCount, 1, "repeat request cannot replace the receipt");

    const status = await request(accountRouter, "get", "/terms-status", "synthetic-member");
    assert.equal(status.body.acceptedAt, first.body.termsAcceptedAt);
    assert.equal(status.body.acceptedVersion, CURRENT_TERMS_VERSION);
    assert.equal(status.body.acceptanceRequired, false);
    const me = await request(accountRouter, "get", "/me", "synthetic-member");
    assert.equal(me.body.account.termsAcceptedAt, first.body.termsAcceptedAt);
    assert.equal(me.body.account.termsVersion, CURRENT_TERMS_VERSION);
    const billing = await request(billingRouter, "get", "/subscription", "synthetic-member");
    assert.equal(billing.body.subscription.termsAcceptedAt, first.body.termsAcceptedAt);
    assert.equal(billing.body.subscription.termsVersion, CURRENT_TERMS_VERSION);
    assert.equal(billing.body.subscription.termsAcceptanceRequired, false);
    const admin = await request(adminRouter, "get", "/clients", "synthetic-terms-admin");
    assert.equal(admin.status, 200, JSON.stringify(admin.body));
    assert.equal(admin.body[0].termsAcceptedAt, first.body.termsAcceptedAt);
    assert.equal(admin.body[0].termsVersion, CURRENT_TERMS_VERSION);
  } finally {
    selects.mock.restore();
    inserts.mock.restore();
    updates.mock.restore();
  }
});