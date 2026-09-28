import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test, { mock } from "node:test";

// Node's native TS loader does not resolve the app's .js-to-.ts source imports.
// Map local imports only, so these tests invoke real route handlers without
// starting a server or connecting to a database. Every payload below is
// rejected before a DB call; the placeholder URL is never contacted.
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
      return { format: "module", source: `export default ${JSON.stringify(readFileSync(new URL(url), "utf8"))};`, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:1/disconnected";

const [{ default: affiliateRouter }, { default: complianceRouter }, history, { default: agreementsRouter }] = await Promise.all([
  import("./affiliates.ts"),
  import("./affiliate-compliance.ts"),
  import("./gapHistory.ts"),
  import("./affiliate-agreements.ts"),
]);
const { db } = await import("@workspace/db");

type Route = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] } };

function handler(router: unknown, method: string, path: string) {
  const layer = (router as { stack: Route[] }).stack.find(
    (item) => item.route?.path === path && item.route.methods[method],
  );
  assert.ok(layer?.route, `${method.toUpperCase()} ${path} is registered`);
  return layer.route.stack.at(-1)!.handle;
}

async function rejects(handlerFn: Function, body: Record<string, unknown>, status = 400) {
  let result: { status: number; body?: any } = { status: 200 };
  const res = {
    status(code: number) { result.status = code; return this; },
    json(payload: unknown) { result.body = payload; return this; },
  };
  await handlerFn({ body, get: () => undefined, log: { info: () => {} } }, {
    ...res,
    set: () => {},
  });
  assert.equal(result.status, status, JSON.stringify(result.body));
  assert.equal(typeof result.body?.error, "string");
}

const application = {
  companyName: "Sample Practice", contactName: "Example Applicant",
  email: "applicant@example.org", phone: "(555) 010-1234",
  about: "I plan to refer organizations that need compliance help.",
};

test("actual application handler rejects suffixed notes and unsafe email", async () => {
  const apply = handler(affiliateRouter, "post", "/apply");
  await rejects(apply, { ...application, about: "Referral note: 0000-0000-ref" });
  await rejects(apply, { ...application, about: "Referral note: 123456789-ref" });
  await rejects(apply, { ...application, email: "user-123456789-ref@example.org" });
});

test("application outcomes are traceable without leaking applicant fields and duplicates are explicit", async () => {
  const apply = handler(affiliateRouter, "post", "/apply");
  const attemptId = "78f04526-2f18-41e5-a6f0-26b3268bf684";
  const previousVersion = process.env.AFFILIATE_REVIEWED_TERMS_VERSION;
  process.env.AFFILIATE_REVIEWED_TERMS_VERSION = "4.0";
  const agreedApplication = {
    ...application, agreed: true, agreementVersion: "4.0", agreementSha256: "a".repeat(64),
  };
  const run = async (body: Record<string, unknown>, existingAt: number[], insertError?: unknown) => {
    let reads = 0;
    const logs: unknown[] = [];
    const headers: Record<string, string> = {};
    let status = 200;
    let payload: any;
    const select = mock.method(db, "select", () => ({
      from: () => ({ where: () => ({ limit: async () => {
        reads += 1;
        return existingAt.includes(reads) ? [{ id: "existing" }] : [];
      } }) }),
    }) as unknown as ReturnType<typeof db.select>);
    let inserts = 0;
    const transaction = mock.method(db, "transaction", async (callback: Function) => callback({
      select: () => ({ from: () => ({ where: () => ({ limit: async () =>
        [{ version: "4.0", contentSha256: "a".repeat(64) }] }) }) }),
      insert: () => ({
        values: () => {
          inserts += 1;
          if (insertError) throw insertError;
          return { returning: async () => [{ id: "created", identityEpoch: 0 }] };
        },
      }),
    }));
    try {
      await apply({
        body,
        get: () => attemptId,
        log: { info: (data: unknown) => logs.push(data) },
      }, {
        set: (key: string, value: string) => { headers[key] = value; },
        status(code: number) { status = code; return this; },
        json(value: unknown) { payload = value; return this; },
      });
    } finally {
      select.mock.restore();
      transaction.mock.restore();
    }
    assert.equal(headers["X-Application-Reference"], attemptId);
    assert.equal(JSON.stringify(logs).includes(application.email), false);
    assert.equal(JSON.stringify(logs).includes(application.contactName), false);
    assert.equal(JSON.stringify(logs).includes(application.phone), false);
    assert.equal(JSON.stringify(logs).includes(application.about), false);
    assert.deepEqual(logs, [
      { applicationReference: attemptId, outcome: "received" },
      { applicationReference: attemptId, outcome: status === 400 ? "validation_rejected" :
        status === 500 ? "persistence_failed" : status === 201 ? "inserted" : "duplicate" },
    ]);
    return { status, payload, inserts };
  };

  try {
  const rejected = await run({ ...agreedApplication, about: "short" }, []);
  assert.equal(rejected.status, 400);
  assert.equal(rejected.inserts, 0);

  const inserted = await run(agreedApplication, []);
  const duplicate = await run(agreedApplication, [1]);
  const racedDuplicate = await run(agreedApplication, [3], { code: "23505", detail: application.about });
  assert.equal(inserted.status, 201);
  assert.equal(duplicate.status, 409);
  assert.equal(racedDuplicate.status, 409);
  assert.equal(duplicate.payload.code, "APPLICATION_ALREADY_EXISTS");
  assert.match(duplicate.payload.error, /an application with this email already exists/i);
  assert.deepEqual(duplicate.payload, racedDuplicate.payload);
  assert.notDeepEqual(inserted.payload, duplicate.payload);
  assert.equal(duplicate.inserts, 0);

  const failed = await run(agreedApplication, [], { code: "23505", detail: application.about });
  assert.equal(failed.status, 500, "a referral-code collision must not pretend an insert succeeded");
  assert.equal(typeof failed.payload.error, "string");
  } finally {
    if (previousVersion === undefined) delete process.env.AFFILIATE_REVIEWED_TERMS_VERSION;
    else process.env.AFFILIATE_REVIEWED_TERMS_VERSION = previousVersion;
  }
});

test("actual admin create and approval handlers reject numeric referral codes", async () => {
  const create = handler(affiliateRouter, "post", "/");
  const approve = handler(affiliateRouter, "post", "/:id/approve");
  await rejects(create, { ...application, referralCode: "000000000" });
  await rejects(approve, { referralCode: "000000000", commissionRatePct: 20 });
  await rejects(create, { ...application, referralCode: "NORTH-2026", email: "user-123456789-ref@example.org" });
  const patch = handler(affiliateRouter, "patch", "/:id");
  await rejects(patch, { email: "user-123456789-ref@example.org" });
});

test("actual document and template create handlers reject unsafe versions and keys", async () => {
  const document = handler(complianceRouter, "post", "/admin/documents");
  const template = handler(complianceRouter, "post", "/admin/email-templates");
  await rejects(document, {
    documentType: "privacy", version: "000000000",
    title: "Privacy notice", content: "The full synthetic privacy notice content is here.",
  });
  await rejects(template, {
    templateKey: "a_000000000",
    subject: "Payout setup", body: "Please complete your setup.",
  });
});

test("legacy numeric document versions cannot be copied into acknowledgements", async () => {
  const select = mock.method(db, "select", () => ({
    from: () => ({ where: () => ({ limit: async () => [{
      id: "synthetic-doc", documentType: "privacy", version: "000000000", status: "published",
    }] }) }),
  }) as unknown as ReturnType<typeof db.select>);
  try {
    const acknowledge = handler(complianceRouter, "post", "/portal/acknowledgements");
    await rejects(acknowledge, {
      documentVersionId: "synthetic-doc", typedLegalName: "Example Applicant", agreed: true,
    }, 409);
    assert.equal(select.mock.callCount(), 1, "no further read, transaction or acknowledgement");
  } finally {
    select.mock.restore();
  }
});

test("legacy template keys cannot be edited", async () => {
  const select = mock.method(db, "select", () => ({
    from: () => ({
      where: () => ({ limit: async () => [{ templateKey: "a_000000000" }] }),
    }),
  }) as unknown as ReturnType<typeof db.select>);
  try {
    const patch = handler(complianceRouter, "patch", "/admin/email-templates/:id");
    let patchResult: { status: number; body?: any } = { status: 200 };
    const res = {
      status(code: number) { patchResult.status = code; return this; },
      json(payload: unknown) { patchResult.body = payload; return this; },
    };
    await patch({ params: { id: "synthetic-template" }, body: { enabled: true } }, res);
    assert.equal(patchResult.status, 409);
  } finally {
    select.mock.restore();
  }
});

test("actual history parser rejects nested suffixed numbers and serializer redacts legacy rows", () => {
  const input = {
    id: "synthetic-scan", institution: "hospital", institutionLabel: "Example",
    topic: "compliance", score: 80, timestamp: "2026-09-24T12:30:00.000Z",
    result: { met: [{ detail: "Found 0000-0000-ref" }] },
  };
  assert.equal(history.parseEntry(input), null);
  assert.equal(history.parseEntry({
    ...input, result: { missing: [{ detail: "Found 123456789-ref" }] },
  }), null);
  const displayed = history.serializeEntry({
    ...input,
    clerkUserId: null,
    sessionTokenHash: null,
    createdAt: new Date(input.timestamp),
    scannedAt: new Date(input.timestamp),
  });
  assert.equal(JSON.stringify(displayed).includes("0000-0000-ref"), false);
});

test("agreement publish handler rejects SAMPLE versions and missing explicit review before storage", async () => {
  const publish = handler(agreementsRouter, "post", "/publish");
  const body = "A synthetic full-length reviewed agreement body for validation only. ".repeat(3);
  // These requests invoke only the final handler with invalid synthetic inputs;
  // neither can pass validation or contact the database.
  await rejects(publish, { version: "SAMPLE-test", body, confirmedReviewed: true });
  await rejects(publish, { version: "reviewed-test", body, confirmedReviewed: false });
  await rejects(publish, { version: "reviewed-test", body });
});

test("paid approval stays blocked while owner-reviewed terms are disabled", async () => {
  const previousEnabled = process.env.AFFILIATE_ACTIVATION_ENABLED;
  const previousVersion = process.env.AFFILIATE_REVIEWED_TERMS_VERSION;
  delete process.env.AFFILIATE_ACTIVATION_ENABLED;
  delete process.env.AFFILIATE_REVIEWED_TERMS_VERSION;
  try {
    await rejects(handler(affiliateRouter, "post", "/:id/approve"),
      { referralCode: "TEST-PARTNER", commissionRatePct: 20 }, 403);
  } finally {
    if (previousEnabled === undefined) delete process.env.AFFILIATE_ACTIVATION_ENABLED;
    else process.env.AFFILIATE_ACTIVATION_ENABLED = previousEnabled;
    if (previousVersion === undefined) delete process.env.AFFILIATE_REVIEWED_TERMS_VERSION;
    else process.env.AFFILIATE_REVIEWED_TERMS_VERSION = previousVersion;
  }
});

test("application holds require an authorized safe reason before touching the database", async () => {
  const hold = handler(affiliateRouter, "post", "/:id/hold");
  await rejects(hold, {});
  await rejects(hold, { reason: "no" });
  await rejects(hold, { reason: "Review needed: 123456789-ref" });
});

test("disapproval changes only pending applications to rejected and records a review audit", async () => {
  let status = "pending";
  const audits: Record<string, any>[] = [];
  const updateFields: Record<string, unknown>[] = [];
  const tx = {
    update: () => ({
      set(fields: Record<string, unknown>) {
        updateFields.push(fields);
        return {
          where: () => ({
            returning: async () => {
              if (status !== "pending") return [];
              status = fields.status as string;
              return [{ id: "synthetic-affiliate", status }];
            },
          }),
        };
      },
    }),
    insert: () => ({
      values: async (fields: Record<string, any>) => { audits.push(fields); },
    }),
  };
  const transaction = mock.method(db, "transaction",
    (async (callback: (trx: typeof tx) => Promise<unknown>) => callback(tx)) as unknown as typeof db.transaction);
  try {
    const reject = handler(affiliateRouter, "post", "/:id/reject");
    async function decide(reason: string) {
      let code = 200;
      let payload: any;
      const res = {
        status(value: number) { code = value; return this; },
        json(value: unknown) { payload = value; return this; },
      };
      await reject({ params: { id: "synthetic-affiliate" }, body: { reason }, clerkUserId: "synthetic-admin" }, res);
      return { code, payload };
    }
    assert.equal((await decide("no")).code, 400);
    assert.equal(status, "pending");
    assert.deepEqual(await decide("Application did not meet the program requirements."), {
      code: 200, payload: { id: "synthetic-affiliate", status: "rejected" },
    });
    assert.equal(status, "rejected");
    assert.equal(updateFields[0]?.status, "rejected");
    assert.equal(audits[0]?.eventType, "application_rejected");
    assert.deepEqual(audits[0]?.newValue, { status: "rejected" });
    assert.equal((await decide("Repeat decision")).code, 409);
    assert.equal(status, "rejected");
    assert.equal(transaction.mock.callCount(), 2);
  } finally {
    transaction.mock.restore();
  }
});