import assert from "node:assert/strict";
import test from "node:test";
import {
  getAuthEmailFrom,
  getResendApiKey,
  selectedTransport,
  deliver,
  sendViaResend,
  mailFailureCategory,
  mailFailureExplanation,
  safeMailMessageId,
} from "./resend-mailer.ts";

/**
 * These tests exist because this module carries login codes. Every failure
 * here is invisible from the outside: the customer sees a code that never
 * arrives and leaves, and nothing in the product looks broken.
 *
 * On 2026-09-22 exactly that happened -- the Replit connector reported itself
 * "Active" while returning 401 in production and 400 in the workspace. So the
 * cases below are mostly about which transport is chosen and whether a failure
 * is reported honestly rather than swallowed.
 */

const ENV_KEYS = ["RESEND_API_KEY", "CLERK_EMAIL_FROM", "TRIAL_EMAIL_FROM"] as const;

/** Run `fn` with a specific environment, restoring whatever was there before. */
async function withEnv(
  env: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
  fn: () => void | Promise<void>,
) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  try {
    for (const key of ENV_KEYS) {
      if (key in env) {
        const value = env[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
    await fn();
  } finally {
    for (const key of ENV_KEYS) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** Replace global fetch, capturing the single call made. */
function captureFetch(response: Partial<Response> & { jsonValue?: unknown }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init: init ?? {} });
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.jsonValue ?? {},
      text: async () => (response as any).textValue ?? "",
    } as any;
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const EMAIL = {
  to: "hector@example.com",
  subject: "123456 is your verification code",
  html: "<p>123456</p>",
  text: "123456",
};

// --- Choosing a from-address --------------------------------------------------------------------

test("a missing from-address is refused rather than guessed", async () => {
  await withEnv({}, () => {
    assert.equal(getAuthEmailFrom(), null);
  });
});

test("resend.dev's shared test address is refused", async () => {
  // It only delivers to the Resend account owner, so a customer's code sent
  // from it silently goes nowhere -- the exact failure this module exists to
  // eliminate.
  await withEnv({ CLERK_EMAIL_FROM: "onboarding@resend.dev" }, () => {
    assert.equal(getAuthEmailFrom(), null);
  });
  await withEnv({ TRIAL_EMAIL_FROM: "Acme <onboarding@resend.dev>" }, () => {
    assert.equal(getAuthEmailFrom(), null);
  });
});

test("CLERK_EMAIL_FROM wins over TRIAL_EMAIL_FROM", async () => {
  await withEnv(
    { CLERK_EMAIL_FROM: "auth@example.com", TRIAL_EMAIL_FROM: "trials@example.com" },
    () => {
      assert.equal(getAuthEmailFrom(), "auth@example.com");
    },
  );
});

// --- Choosing a transport --------------------------------------------------------------------

test("a configured API key is preferred over the connector", async () => {
  await withEnv({ RESEND_API_KEY: "re_test_key" }, () => {
    assert.equal(selectedTransport(), "api_key");
  });
});

test("with no API key the connector is still used", async () => {
  // The fallback has to keep working, or adding this feature would break a
  // deployment that has not set the key yet.
  await withEnv({}, () => {
    assert.equal(selectedTransport(), "connector");
  });
});

test("a blank or whitespace-only key does not count as configured", async () => {
  for (const value of ["", "   ", "\n"]) {
    await withEnv({ RESEND_API_KEY: value }, () => {
      assert.equal(getResendApiKey(), null, `"${JSON.stringify(value)}" must not count`);
      assert.equal(selectedTransport(), "connector");
    });
  }
});

test("a key pasted with surrounding whitespace is trimmed", async () => {
  // Secrets fields routinely capture a trailing newline, and `Bearer re_x\n`
  // is rejected as malformed -- which reads exactly like a wrong key.
  await withEnv({ RESEND_API_KEY: "  re_test_key\n" }, () => {
    assert.equal(getResendApiKey(), "re_test_key");
  });
});

// --- Sending --------------------------------------------------------------------

test("sending with an API key goes straight to Resend with a bearer token", async () => {
  const fetchStub = captureFetch({ ok: true, status: 200, jsonValue: { id: "re_123" } });
  try {
    await withEnv(
      { RESEND_API_KEY: " re_test_key\n", CLERK_EMAIL_FROM: "Acme <auth@example.com>" },
      async () => {
        const result = await sendViaResend(EMAIL);
        assert.equal(result.sent, true);
        assert.equal((result as any).id, "re_123");
        assert.equal(result.transport, "api_key");

        assert.equal(fetchStub.calls.length, 1);
        const [call] = fetchStub.calls;
        assert.equal(call.url, "https://api.resend.com/emails");
        assert.equal(call.init.method, "POST");

        const headers = call.init.headers as Record<string, string>;
        // No stray newline: the trim must happen before the header is built.
        assert.equal(headers.Authorization, "Bearer re_test_key");
        assert.equal(headers["Content-Type"], "application/json");

        const body = JSON.parse(String(call.init.body));
        assert.equal(body.from, "Acme <auth@example.com>");
        assert.deepEqual(body.to, [EMAIL.to]);
        assert.equal(body.subject, EMAIL.subject);
        assert.equal(body.html, EMAIL.html);
        assert.equal(body.text, EMAIL.text);
      },
    );
  } finally {
    fetchStub.restore();
  }
});

test("a Resend rejection is reported, not swallowed", async () => {
  // The caller answers Clerk with a 500 on this so the send is retried. If a
  // failure came back as success, the code would be dropped silently.
  const fetchStub = captureFetch({ ok: false, status: 403, textValue: "domain not verified" } as any);
  try {
    await withEnv(
      { RESEND_API_KEY: "re_test_key", CLERK_EMAIL_FROM: "auth@example.com" },
      async () => {
        const result = await sendViaResend(EMAIL);
        assert.equal(result.sent, false);
        assert.equal((result as any).status, 403);
        assert.match((result as any).error, /domain not verified/);
        // The transport is named in the message, because the two paths fail
        // differently and that is the first thing worth knowing.
        assert.match((result as any).error, /\[api_key\]/);
      },
    );
  } finally {
    fetchStub.restore();
  }
});

test("a network error is reported rather than thrown at the webhook handler", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("socket hang up"); }) as typeof fetch;
  try {
    await withEnv(
      { RESEND_API_KEY: "re_test_key", CLERK_EMAIL_FROM: "auth@example.com" },
      async () => {
        const result = await sendViaResend(EMAIL);
        assert.equal(result.sent, false);
        assert.match((result as any).error, /socket hang up/);
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("no from-address means nothing is sent at all", async () => {
  const fetchStub = captureFetch({ ok: true });
  try {
    await withEnv({ RESEND_API_KEY: "re_test_key" }, async () => {
      const result = await sendViaResend(EMAIL);
      assert.equal(result.sent, false);
      assert.equal(result.transport, "none");
      assert.equal(fetchStub.calls.length, 0, "must not call Resend without a from-address");
    });
  } finally {
    fetchStub.restore();
  }
});

// --- deliver(): the shared path the notices use --------------------------------------------------------------------

test("deliver sends to every recipient with the caller's own from-address", async () => {
  // The admin report goes to a list, and the trial notices use a different
  // sender than login codes do. Both went through their own copy of this
  // call until one dead credential took all of them down together.
  const fetchStub = captureFetch({ ok: true, status: 200, jsonValue: { id: "re_9" } });
  try {
    await withEnv({ RESEND_API_KEY: "re_test_key" }, async () => {
      const result = await deliver({
        from: "Reports <reports@example.com>",
        to: ["a@example.com", "b@example.com"],
        subject: "Monthly report",
        html: "<p>report</p>",
      });
      assert.equal(result.sent, true);
      const body = JSON.parse(String(fetchStub.calls[0].init.body));
      assert.equal(body.from, "Reports <reports@example.com>");
      assert.deepEqual(body.to, ["a@example.com", "b@example.com"]);
      // No text field invented when the caller supplied none.
      assert.equal("text" in body, false);
    });
  } finally {
    fetchStub.restore();
  }
});

test("deliver reports a provider rejection instead of resolving successfully", async () => {
  // Trial notices mark an account as warned before sending and release that
  // claim on failure. If a rejection looked like success the claim would
  // stick and the customer would never be warned their trial was ending.
  const fetchStub = captureFetch({ ok: false, status: 422, textValue: "invalid from" } as any);
  try {
    await withEnv({ RESEND_API_KEY: "re_test_key" }, async () => {
      const result = await deliver({
        from: "x@example.com",
        to: ["y@example.com"],
        subject: "s",
        html: "<p>h</p>",
      });
      assert.equal(result.sent, false);
      assert.equal((result as any).status, 422);
      assert.match((result as any).error, /invalid from/);
    });
  } finally {
    fetchStub.restore();
  }
});

// --- The regression this was written for --------------------------------------------------------------------

test("a configured API key never falls back to the broken connector", async () => {
  // The connector returned 401 in production and 400 in the workspace while
  // reporting itself healthy. If a key is set, that path must not be reached.
  const fetchStub = captureFetch({ ok: true, status: 200, jsonValue: { id: "re_1" } });
  try {
    await withEnv(
      { RESEND_API_KEY: "re_test_key", CLERK_EMAIL_FROM: "auth@example.com" },
      async () => {
        const result = await sendViaResend(EMAIL);
        assert.equal(result.transport, "api_key");
        assert.equal(fetchStub.calls[0]?.url, "https://api.resend.com/emails");
      },
    );
  } finally {
    fetchStub.restore();
  }
});

test("invitation failure categories depend only on safe transport metadata", () => {
  const privateDetail = "hector@example.com #token=abc re_secret";
  const failures = [
    [{ sent: false, transport: "none", error: privateDetail }, "sender_configuration"],
    [{ sent: false, transport: "connector", status: 401, error: privateDetail }, "authentication"],
    [{ sent: false, transport: "api_key", status: 403, error: privateDetail }, "sender_permission"],
    [{ sent: false, transport: "api_key", status: 422, error: privateDetail }, "invalid_message"],
    [{ sent: false, transport: "api_key", status: 429, error: privateDetail }, "rate_limited"],
    [{ sent: false, transport: "connector", status: 503, error: privateDetail }, "provider_unavailable"],
    [{ sent: false, transport: "api_key", error: privateDetail }, "network"],
    [{ sent: false, transport: "api_key", status: 409, error: privateDetail }, "provider_rejected"],
  ] as const;
  for (const [result, category] of failures) {
    assert.equal(mailFailureCategory(result), category);
    assert.ok(mailFailureExplanation[category]);
    assert.doesNotMatch(JSON.stringify({ category, explanation: mailFailureExplanation[category] }), /hector|token|re_secret/);
  }
});

test("only UUID-shaped provider receipts can be stored", () => {
  const id = "49a3999c-0ce1-4ea6-a6d7-e02d5bc0181c";
  assert.equal(safeMailMessageId(id), id);
  for (const untrusted of [undefined, "re_123", "hector@example.com", "a".repeat(64), `${id} #token=secret`]) {
    assert.equal(safeMailMessageId(untrusted), null);
  }
});
