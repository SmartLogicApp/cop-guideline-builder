import assert from "node:assert/strict";
import { createHash, randomBytes, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const ui = readFileSync(new URL("../index.jsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../artifacts/api-server/src/routes/gapHistory.ts", import.meta.url), "utf8");

function storage() {
  const items = new Map();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, String(value)),
  };
}

function browserHarness() {
  const start = ui.indexOf('const LEGACY_GAP_HISTORY_KEY =');
  const end = ui.indexOf('export async function purgeEphemeralPolicySession()', start);
  assert.ok(start >= 0 && end > start, "history helpers must be present");
  const localStorage = storage();
  const sessionStorage = storage();
  let online = true;
  let failDelete = false;
  const remote = new Map();
  const requests = [];
  const fetch = async (url, options = {}) => {
    if (!online) throw new Error("offline");
    const owner = options.headers?.["X-Gap-History-Owner"];
    requests.push({ url, owner, method: options.method ?? "GET" });
    const entries = remote.get(owner) ?? [];
    if (options.method === "POST") {
      const entry = JSON.parse(options.body);
      remote.set(owner, [entry, ...entries.filter((row) => row.id !== entry.id)].slice(0, 10));
      return { ok: true, status: 201 };
    }
    if (options.method === "DELETE") {
      if (failDelete) throw new Error("delete unavailable");
      remote.set(owner, entries.filter((row) => row.id !== decodeURIComponent(url.split("/").at(-1))));
      return { ok: true, status: 204 };
    }
    return { ok: true, json: async () => entries };
  };
  const context = vm.createContext({ localStorage, sessionStorage, crypto: webcrypto, fetch });
  vm.runInContext(`${ui.slice(start, end)}
    globalThis.historyApi = { loadGapHistory, saveGapEntry, deleteGapEntry, fetchGapHistory, loadPendingGapHistoryDeletions };`, context);
  return {
    ...context.historyApi, localStorage, sessionStorage, remote, requests,
    setOnline(value) { online = value; },
    setFailDelete(value) { failDelete = value; },
  };
}

const entry = (id, day = 1) => ({
  id, institution: "hospital", institutionLabel: "Hospital", topic: "Safety", score: 80,
  timestamp: `2026-09-${String(day).padStart(2, "0")}T12:00:00.000Z`,
  result: { score: 80, met: [], weak: [], missing: [] },
});
const ids = (rows) => Array.from(rows, (row) => row.id);

test("changing users initializes only from the new owner's storage, including anonymous", async () => {
  const app = browserHarness();
  app.localStorage.setItem("cms_gap_analysis_history_cache:alice", JSON.stringify([entry("alice")]));
  app.localStorage.setItem("cms_gap_analysis_history_cache:bob", JSON.stringify([entry("bob")]));
  app.sessionStorage.setItem("cms_gap_analysis_history_cache:anonymous", JSON.stringify([entry("guest")]));
  assert.deepEqual(ids(app.loadGapHistory("alice")), ["alice"]);
  assert.deepEqual(ids(app.loadGapHistory("bob")), ["bob"]);
  assert.deepEqual(ids(app.loadGapHistory(null)), ["guest"]);
  assert.deepEqual(ids(await app.fetchGapHistory("bob")), ["bob"]);
  assert.deepEqual(ids(await app.fetchGapHistory(null)), ["guest"]);
  assert.deepEqual(ids(app.loadGapHistory("alice")), ["alice"]);
  assert.ok(app.requests.every(({ owner }) => owner === "bob" || owner === "anonymous"));
  // The scanner's keyed remount is essential: useState's initializer runs only on mount.
  assert.match(ui, /resolvedHistoryOwnerId === undefined[\s\S]*?Loading saved scan history/);
  assert.match(ui, /key=\{resolvedHistoryOwnerId \|\| "anonymous"\}[\s\S]*?historyOwnerId=\{resolvedHistoryOwnerId\}/);
  assert.match(ui, /useState\(\(\) => loadGapHistory\(historyOwnerId\)\)/);
});

test("offline saves upload on reconnect and offline deletions cannot be resurrected", async () => {
  const app = browserHarness();
  app.setOnline(false);
  await assert.rejects(app.saveGapEntry(entry("offline"), "alice"), /offline/);
  assert.deepEqual(ids(app.loadGapHistory("alice")), ["offline"]);
  assert.deepEqual(ids(app.loadGapHistory("bob")), []);
  app.setOnline(true);
  assert.deepEqual(ids(await app.fetchGapHistory("alice")), ["offline"]);
  assert.deepEqual(ids(app.remote.get("alice")), ["offline"]);

  app.setOnline(false);
  await assert.rejects(app.deleteGapEntry("offline", "alice"), /offline/);
  assert.deepEqual(ids(app.loadGapHistory("alice")), []);
  assert.deepEqual(Array.from(app.loadPendingGapHistoryDeletions("alice")), ["offline"]);
  await assert.rejects(app.fetchGapHistory("alice"), /offline/);
  app.setOnline(true);
  assert.deepEqual(ids(await app.fetchGapHistory("alice")), []);
  assert.deepEqual(ids(app.remote.get("alice")), []);
  assert.deepEqual(Array.from(app.loadPendingGapHistoryDeletions("alice")), []);
  assert.deepEqual(ids(await app.fetchGapHistory("alice")), []);
});

test("a failed queued delete stays hidden even if listing succeeds and retries next sync", async () => {
  const app = browserHarness();
  app.remote.set("alice", [entry("deleted")]);
  await app.fetchGapHistory("alice");
  app.setOnline(false);
  await assert.rejects(app.deleteGapEntry("deleted", "alice"));
  app.setOnline(true);
  app.setFailDelete(true);
  assert.deepEqual(ids(await app.fetchGapHistory("alice")), []);
  assert.deepEqual(ids(app.loadGapHistory("alice")), []);
  assert.deepEqual(Array.from(app.loadPendingGapHistoryDeletions("alice")), ["deleted"]);
  app.setFailDelete(false);
  assert.deepEqual(ids(await app.fetchGapHistory("alice")), []);
  assert.deepEqual(ids(app.remote.get("alice")), []);
  assert.deepEqual(Array.from(app.loadPendingGapHistoryDeletions("alice")), []);
});

test("browser cache and reconciliation retain only ten most recent scans", async () => {
  const app = browserHarness();
  app.setOnline(false);
  for (let day = 1; day <= 12; day++) {
    await assert.rejects(app.saveGapEntry(entry(`scan-${day}`, day), "alice"));
  }
  assert.deepEqual(ids(app.loadGapHistory("alice")), Array.from({ length: 10 }, (_, i) => `scan-${12 - i}`));
  app.setOnline(true);
  assert.equal((await app.fetchGapHistory("alice")).length, 10);
  assert.equal(app.remote.get("alice").length, 10);
});

function serverHarness() {
  const handlers = new Map();
  const rows = new Map();
  const gapHistory = Object.fromEntries(
    ["id", "clerkUserId", "sessionTokenHash", "createdAt", "scannedAt"].map((name) => [name, name]),
  );
  const eq = (key, value) => (row) => row[key] === value;
  const and = (...predicates) => (row) => predicates.every((predicate) => predicate(row));
  const isNull = (key) => (row) => row[key] == null;
  const lt = (key, value) => (row) => row[key] < value;
  const inArray = (key, values) => (row) => values.includes(row[key]);
  const desc = (key) => key;
  const select = (projection) => {
    let chosen = [];
    const query = {
      from() { return query; },
      where(predicate) { chosen = [...rows.values()].filter(predicate); return query; },
      orderBy(key) { chosen.sort((a, b) => b[key] - a[key]); return query; },
      limit(count) { return Promise.resolve(chosen.slice(0, count).map(project)); },
      then(resolve, reject) { return Promise.resolve(chosen.map(project)).then(resolve, reject); },
    };
    const project = (row) => projection ? Object.fromEntries(Object.entries(projection).map(([name, key]) => [name, row[key]])) : row;
    return query;
  };
  const db = {
    select,
    delete: () => ({ where(predicate) {
      for (const [id, row] of rows) if (predicate(row)) rows.delete(id);
      return Promise.resolve();
    } }),
    insert: () => ({ values(row) { return {
      onConflictDoNothing() { return {
        returning() {
          if (rows.has(row.id)) return Promise.resolve([]);
          const saved = { ...row, createdAt: new Date() };
          rows.set(row.id, saved);
          return Promise.resolve([saved]);
        },
      }; },
    }; } }),
    update: () => ({ set(values) { return {
      where(predicate) { return {
        returning() {
          const row = [...rows.values()].find(predicate);
          if (!row) return Promise.resolve([]);
          Object.assign(row, values);
          return Promise.resolve([row]);
        },
      }; },
    }; } }),
    transaction: (callback) => callback(db),
  };
  const router = {
    use() {},
    get(path, handler) { handlers.set(`GET ${path}`, handler); },
    post(path, handler) { handlers.set(`POST ${path}`, handler); },
    delete(path, handler) { handlers.set(`DELETE ${path}`, handler); },
  };
  const mocks = {
    "node:crypto": { createHash },
    express: { Router: () => router },
    "express-rate-limit": { default: () => (_req, _res, next) => next() },
    "@clerk/express": { getAuth: (req) => ({ userId: req.userId }) },
    "drizzle-orm": { and, eq, desc, isNull, lt, inArray },
    "@workspace/db": { db, gapHistory },
    "../lib/affiliate-sensitive-boundary.js": {
      containsSensitiveFinancialData: () => false,
      redactSensitiveFinancialData: (value) => value,
    },
  };
  const compiled = ts.transpileModule(route, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(compiled, {
    exports: {}, require(name) {
      assert.ok(name in mocks, `unexpected route dependency ${name}`);
      return mocks[name];
    }, Buffer, Date,
  });
  async function request(method, path, { userId = null, owner = "anonymous", token, body } = {}) {
    const base = path.startsWith("/gap-history/") ? "/gap-history/:id" : path;
    const handler = handlers.get(`${method} ${base}`);
    assert.ok(handler, `${method} ${path} exists`);
    let status = 200;
    let payload;
    const req = {
      userId, body, params: { id: decodeURIComponent(path.split("/").at(-1)) },
      header(name) {
        return { "x-gap-history-owner": owner, "x-gap-session-token": token }[name];
      },
    };
    const res = {
      status(value) { status = value; return this; },
      json(value) { payload = value; return this; },
      setHeader() {},
      sendStatus(value) { status = value; return this; },
    };
    await handler(req, res);
    return { status, payload };
  }
  return { request, rows };
}

test("server rejects owner assertions and isolates reads, updates, and deletes across users and anonymous tokens", async () => {
  const { request } = serverHarness();
  const alice = { userId: "alice", owner: "alice" };
  const bob = { userId: "bob", owner: "bob" };
  const guest = { token: randomBytes(32).toString("hex") };
  const otherGuest = { token: randomBytes(32).toString("hex") };
  for (const [owner, scan] of [[alice, "a"], [bob, "b"], [guest, "g"], [otherGuest, "h"]]) {
    assert.equal((await request("POST", "/gap-history", { ...owner, body: entry(scan) })).status, 201);
  }
  for (const [owner, expected] of [[alice, "a"], [bob, "b"], [guest, "g"], [otherGuest, "h"]]) {
    assert.deepEqual(ids((await request("GET", "/gap-history", owner)).payload), [expected]);
  }
  assert.equal((await request("GET", "/gap-history", { ...alice, owner: "bob" })).status, 401);
  assert.equal((await request("POST", "/gap-history", { ...alice, owner: "anonymous", token: guest.token, body: entry("forged") })).status, 401);
  assert.equal((await request("DELETE", "/gap-history/a", { ...bob, owner: "alice" })).status, 401);
  assert.equal((await request("GET", "/gap-history", { token: "invalid" })).status, 401);
  for (const owner of [bob, guest, otherGuest]) {
    assert.equal((await request("POST", "/gap-history", { ...owner, body: entry("a") })).status, 409);
    assert.equal((await request("DELETE", "/gap-history/a", owner)).status, 204);
    assert.deepEqual(ids((await request("GET", "/gap-history", alice)).payload), ["a"]);
  }
  assert.equal((await request("POST", "/gap-history", { ...alice, body: entry("g") })).status, 409);
  assert.equal((await request("DELETE", "/gap-history/g", alice)).status, 204);
  assert.deepEqual(ids((await request("GET", "/gap-history", guest)).payload), ["g"]);
});

test("server prunes expired anonymous scans and caps each owner's history at ten", async () => {
  const { request, rows } = serverHarness();
  const guest = { token: randomBytes(32).toString("hex") };
  const alice = { userId: "alice", owner: "alice" };
  for (let day = 1; day <= 12; day++) {
    assert.equal((await request("POST", "/gap-history", { ...alice, body: entry(`a-${day}`, day) })).status, 201);
  }
  assert.deepEqual(ids((await request("GET", "/gap-history", alice)).payload), Array.from({ length: 10 }, (_, i) => `a-${12 - i}`));
  await request("POST", "/gap-history", { ...guest, body: entry("old") });
  rows.get("old").createdAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
  rows.get("a-12").createdAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
  assert.deepEqual(ids((await request("GET", "/gap-history", guest)).payload), []);
  assert.equal(rows.has("old"), false);
  assert.equal(rows.has("a-12"), true);
});