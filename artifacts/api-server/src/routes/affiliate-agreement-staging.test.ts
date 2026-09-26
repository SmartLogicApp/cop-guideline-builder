import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { prepareAffiliateAgreementV4 } from "../lib/affiliate-agreement-v4.ts";

// Resolve source .js imports without running the application, Clerk middleware,
// a database, or any production service. This test only invokes the GET route.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".")) {
      const candidates = specifier.endsWith(".js")
        ? [specifier.slice(0, -3) + ".ts", specifier]
        : [specifier, `${specifier}/index.ts`, `${specifier}.ts`];
      for (const candidate of candidates) {
        try { return nextResolve(candidate, context); } catch { /* try next local candidate */ }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("/affiliate-partner-agreement-v4-source.txt")) {
      return {
        format: "module",
        source: `export default ${JSON.stringify(readFileSync(fileURLToPath(url), "utf8"))};`,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});
process.env.DATABASE_URL = "postgresql://test:test@localhost:1/disconnected";
process.env.ADMIN_CLERK_USER_IDS = "synthetic-staging-super-admin";

const { default: router } = await import("./affiliate-agreements.ts");
const route = (router as any).stack.find((layer: any) =>
  layer.route?.path === "/v4-draft" && layer.route.methods.get,
)?.route;
assert.ok(route, "GET /v4-draft must exist");

async function requestDraft(userId: string | null) {
  let status = 200;
  let body: any;
  let handlerCalled = false;
  // Clerk's getAuth requires the middleware's branded request auth function.
  // This is a local synthetic auth object, not a token or a real Clerk account.
  const auth = Object.assign(() => ({ userId, tokenType: "session_token" }), {
    [Symbol.for("@clerk/express.auth")]: true,
  });
  const req = { auth };
  const res = {
    status(code: number) { status = code; return this; },
    json(payload: unknown) { body = payload; return this; },
  };
  await new Promise<void>((resolve, reject) => {
    try {
      const next = (error?: unknown) => {
        if (error) { reject(error); return; }
        handlerCalled = true;
        Promise.resolve(route.stack[1].handle(req, res)).then(() => resolve(), reject);
      };
      const result = route.stack[0].handle(req, res, next);
      if (result !== undefined) Promise.resolve(result).then(() => {
        if (!handlerCalled) resolve();
      }, reject);
    } catch (error) { reject(error); }
  });
  return { status, body, handlerCalled };
}

test("synthetic super-admin receives only canonical source-derived Version 4.0 text and checksum", async () => {
  const source = await readFile(new URL("../legal/affiliate-partner-agreement-v4-source.txt", import.meta.url), "utf8");
  const expected = prepareAffiliateAgreementV4(source);
  const response = await requestDraft("synthetic-staging-super-admin");
  assert.equal(response.status, 200);
  assert.equal(response.handlerCalled, true);
  assert.deepEqual(response.body, {
    version: "4.0",
    body: expected,
    contentSha256: createHash("sha256").update(expected).digest("hex"),
  });
});

test("signed-out and non-super-admin sessions never receive the draft", async () => {
  for (const [userId, expectedStatus] of [[null, 401], ["synthetic-other-user", 403]] as const) {
    const response = await requestDraft(userId);
    assert.equal(response.status, expectedStatus);
    assert.equal(response.handlerCalled, false);
    assert.equal("body" in response.body, false);
  }
});