import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithClerkToken } from "./workspace-auth-fetch.js";

test("a transient 401 after a native dialog retries with a fresh Clerk token", async () => {
  const requests = [];
  const tokenCalls = [];
  const getToken = async (options) => {
    tokenCalls.push(options);
    return options?.skipCache ? "refreshed" : "initial";
  };
  const request = async (url, options) => {
    requests.push({ url, authorization: options.headers.get("Authorization"), body: options.body });
    return { status: requests.length === 1 ? 401 : 200 };
  };
  const result = await fetchWithClerkToken("/api/affiliates/test/reject",
    { method: "POST", body: '{"reason":"Not a match"}' }, getToken, request);
  assert.equal(result.status, 200);
  assert.deepEqual(tokenCalls, [undefined, { skipCache: true }]);
  assert.deepEqual(requests.map(({ authorization }) => authorization), ["Bearer initial", "Bearer refreshed"]);
  assert.equal(requests[1].body, requests[0].body);
});

test("a persistent 401 stays unauthorized; no signed-out request is sent", async () => {
  let requests = 0;
  const request = async () => { requests += 1; return { status: 401 }; };
  assert.equal((await fetchWithClerkToken("/api/accounts/me", {}, async () => "token", request)).status, 401);
  assert.equal(requests, 2);
  await assert.rejects(() => fetchWithClerkToken("/api/accounts/me", {}, async () => null, request),
    /Sign in again/);
  assert.equal(requests, 2);
});