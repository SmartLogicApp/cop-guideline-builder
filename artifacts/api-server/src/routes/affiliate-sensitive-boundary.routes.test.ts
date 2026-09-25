import assert from "node:assert/strict";
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
});
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:1/disconnected";

const [{ default: affiliateRouter }, { default: complianceRouter }, history] = await Promise.all([
  import("./affiliates.ts"),
  import("./affiliate-compliance.ts"),
  import("./gapHistory.ts"),
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
  await handlerFn({ body }, res);
  assert.equal(result.status, status, JSON.stringify(result.body));
  assert.equal(typeof result.body?.error, "string");
}

const application = {
  companyName: "Sample Practice", contactName: "Example Applicant",
  email: "applicant@example.org", phone: "(555) 010-1234",
  about: "I plan to refer organizations that need compliance help.",
};

test("actual application handler rejects suffixed notes and both adjacent contact fields", async () => {
  const apply = handler(affiliateRouter, "post", "/apply");
  await rejects(apply, { ...application, about: "Referral note: 0000-0000-ref" });
  await rejects(apply, { ...application, about: "Referral note: 123456789-ref" });
  await rejects(apply, { ...application, phone: "000000000" });
  await rejects(apply, { ...application, email: "user-123456789-ref@example.org" });
});

test("actual admin create and approval handlers reject numeric referral codes", async () => {
  const create = handler(affiliateRouter, "post", "/");
  const approve = handler(affiliateRouter, "post", "/:id/approve");
  await rejects(create, { ...application, referralCode: "000000000" });
  await rejects(approve, { referralCode: "000000000", commissionRatePct: 20 });
  await rejects(create, { ...application, referralCode: "NORTH-2026", email: "user-123456789-ref@example.org" });
  await rejects(create, { ...application, referralCode: "NORTH-2026", phone: "000000000" });
  const patch = handler(affiliateRouter, "patch", "/:id");
  await rejects(patch, { email: "user-123456789-ref@example.org" });
  await rejects(patch, { phone: "000000000" });
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