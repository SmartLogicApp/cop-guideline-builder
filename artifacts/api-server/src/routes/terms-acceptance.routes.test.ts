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
process.env.ADMIN_CLERK_USER_IDS = "user_synthetic_terms_admin";

const [{ default: accountRouter }, { default: billingRouter }, { default: adminRouter }, schema, terms] =
  await Promise.all([
    import("./accounts.ts"),
    import("./billing.ts"),
    import("./admin.ts"),
    import("@workspace/db"),
    import("../lib/terms-versions.ts"),
  ]);
const { clerkClient } = await import("@clerk/express");
const { db, accounts, accountUsers, adminUsers, affiliates, tokenUsage, termsAcceptances } = schema;
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
              ? registered && allowed ? [{
                accountUser: {
                  accountId: account.id,
                  clerkUserId: "synthetic-member",
                  email: "member@example.test",
                  role: "admin",
                },
                account,
              }] : []
              : registered && allowed ? [{
                accountId: account.id,
                clerkUserId: "synthetic-member",
                email: "member@example.test",
                role: "admin",
              }] : [];
          }
          if (table === accounts) return registered ? [account] : [];
          if (table === affiliates) return [];
          if (table === adminUsers) return [];
          if (table === tokenUsage) return [];
          throw new Error("Unexpected select table");
        },
        then(resolve: (value: any[]) => void) {
          resolve(table === accounts ? registered ? [account] : []
            : table === accountUsers ? registered && allowed ? [{
              accountId: account.id,
              clerkUserId: "synthetic-member",
              email: "member@example.test",
              role: "admin",
            }] : []
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
    const admin = await request(adminRouter, "get", "/clients", "user_synthetic_terms_admin");
    assert.equal(admin.status, 200, JSON.stringify(admin.body));
    assert.equal(admin.body[0].termsAcceptedAt, first.body.termsAcceptedAt);
    assert.equal(admin.body[0].termsVersion, CURRENT_TERMS_VERSION);
  } finally {
    selects.mock.restore();
    inserts.mock.restore();
    updates.mock.restore();
  }
});

test("interrupted signup cannot leave a consultant trial without an acceptance receipt", async () => {
  const userId = "synthetic-new-consultant";
  const clerkUserLookup = mock.method(clerkClient.users, "getUser", async (requestedUserId: string) => {
    assert.equal(requestedUserId, userId);
    return {
      id: userId,
      primaryEmailAddressId: "synthetic-primary-email",
      emailAddresses: [{
        id: "synthetic-primary-email",
        emailAddress: "affiliate@example.test",
        verification: { status: "verified" },
      }],
    } as Awaited<ReturnType<typeof clerkClient.users.getUser>>;
  });
  const body = {
    identifierType: "consultant",
    facilityName: "Example Consultant",
    termsVersion: CURRENT_TERMS_VERSION,
    acceptedAt: new Date().toISOString(),
    acceptsTerms: true,
  };
  let committed: { account: Record<string, any>; accountUser: Record<string, any>; receipt: Record<string, any> } | null = null;
  let failReceipt = true;
  const selects = mock.method(db, "select", () => ({
    from(table: unknown) {
      const builder: any = {
        where: () => builder,
        leftJoin: () => builder,
        then: (resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) =>
          Promise.resolve([]).then(resolve, reject),
        limit: async () => table === affiliates ? [{
          id: "synthetic-active-affiliate",
          companyName: "Example Partner",
          status: "active",
          clerkUserId: null,
          applicationHeldAt: null,
        }]
          : table === accountUsers && committed
          ? [{ accountUser: committed.accountUser, account: committed.account, accountId: committed.account.id }]
          : table === accounts && committed ? [committed.account] : [],
      };
      return builder;
    },
  }) as unknown as typeof db.select);
  const transactions = mock.method(db, "transaction", (async (callback: Function) => {
    let pendingAccount: Record<string, any> | null = null;
    let pendingUser: Record<string, any> | null = null;
    let pendingReceipt: Record<string, any> | null = null;
    const tx = {
      select() {
        return {
          from() {
            const builder: any = {
              where: () => builder,
              for: () => builder,
              limit: async () => [{
                id: "synthetic-active-affiliate",
                companyName: "Example Partner",
                status: "active",
                clerkUserId: null,
                applicationHeldAt: null,
              }],
            };
            return builder;
          },
        };
      },
      update() {
        return {
          set() {
            return {
              where() {
                return { returning: async () => [{ id: "synthetic-active-affiliate" }] };
              },
            };
          },
        };
      },
      insert(table: unknown) {
        return {
          values(value: Record<string, any>) {
            if (table === termsAcceptances) {
              if (failReceipt) throw new Error("Simulated receipt insertion failure");
              pendingReceipt = value;
              return Promise.resolve();
            }
            return {
              returning: async () => {
                if (table === accounts) {
                  pendingAccount = { id: "synthetic-consultant-account", ...value };
                  return [pendingAccount];
                }
                assert.equal(table, accountUsers);
                pendingUser = value;
                return [pendingUser];
              },
            };
          },
        };
      },
    };
    const result = await callback(tx);
    assert.ok(pendingAccount && pendingUser && pendingReceipt);
    committed = { account: pendingAccount, accountUser: pendingUser, receipt: pendingReceipt };
    return result;
  }) as unknown as typeof db.transaction);

  try {
    const missingConsent = await request(accountRouter, "post", "/register", userId, {
      ...body, acceptsTerms: false,
    });
    assert.equal(missingConsent.status, 400);
    assert.equal(transactions.mock.callCount(), 0);

    await assert.rejects(request(accountRouter, "post", "/register", userId, body), /receipt insertion failure/);
    assert.equal(committed, null, "failed receipt rolls back the account and trial");
    const unsigned = await request(accountRouter, "get", "/me", userId);
    assert.equal(unsigned.body.account, null);
    assert.equal(unsigned.body.isActive, false);

    failReceipt = false;
    const registered = await request(accountRouter, "post", "/register", userId, body);
    assert.equal(registered.status, 201);
    assert.equal(registered.body.account.termsVersion, CURRENT_TERMS_VERSION);
    assert.equal(registered.body.account.termsAcceptedAt, committed!.receipt.acceptedAt.toISOString());

    // The browser disappears before its follow-up POST; signing back in still
    // finds the same account, receipt, and access without any recovery click.
    const signedBackIn = await request(accountRouter, "get", "/me", userId);
    assert.equal(signedBackIn.body.isActive, true);
    assert.equal(signedBackIn.body.account.termsVersion, CURRENT_TERMS_VERSION);
    assert.equal(signedBackIn.body.account.termsAcceptedAt, registered.body.account.termsAcceptedAt);
  } finally {
    selects.mock.restore();
    transactions.mock.restore();
    clerkUserLookup.mock.restore();
  }
});