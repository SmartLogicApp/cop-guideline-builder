import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import test from "node:test";

const rootDirectory = resolve(new URL("..", import.meta.url).pathname);
const serverEntry = resolve(
  rootDirectory,
  "artifacts/api-server/dist/index.mjs",
);

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return address.port;
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;

  child.kill("SIGTERM");
  const exited = once(child, "exit");
  const forced = new Promise((resolveForced) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
      resolveForced();
    }, 3_000);
    timer.unref();
  });
  await Promise.race([exited, forced]);
  if (child.exitCode === null && child.signalCode === null) {
    await once(child, "exit");
  }
}

function collectOutput(child) {
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  return () => output;
}

function spawnApi(port, extraEnv = {}) {
  return spawn(process.execPath, [serverEntry], {
    cwd: rootDirectory,
    env: {
      NODE_ENV: "production",
      CLERK_SECRET_KEY: "sk_live_readiness_smoke",
      CLERK_PUBLISHABLE_KEY: "pk_live_readiness_smoke",
      PORT: String(port),
      API_READINESS_SMOKE: "1",
      DATABASE_URL:
        "postgresql://readiness-smoke:readiness-smoke@127.0.0.1:1/readiness_smoke",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

test("compiled production API refuses a Clerk development secret before listening", async () => {
  const port = await availablePort();
  const child = spawnApi(port, { CLERK_SECRET_KEY: "sk_test_readiness_smoke" });
  const getOutput = collectOutput(child);
  const timeout = AbortSignal.timeout(10_000);
  try {
    const [code] = await once(child, "exit", { signal: timeout });
    assert.notEqual(code, 0);
    assert.match(getOutput(), /Production startup blocked:.*development credentials.*sk_live_/);
    assert.doesNotMatch(getOutput(), /Server listening/);
  } finally {
    await stopProcess(child);
  }
});

test("compiled production API refuses a development publishable key with a live secret", async () => {
  const port = await availablePort();
  const child = spawnApi(port, { CLERK_PUBLISHABLE_KEY: "pk_test_readiness_smoke" });
  const getOutput = collectOutput(child);
  try {
    const [code] = await once(child, "exit", { signal: AbortSignal.timeout(10_000) });
    assert.notEqual(code, 0);
    assert.match(getOutput(), /Production startup blocked:.*CLERK_PUBLISHABLE_KEY.*development credentials.*pk_live_/);
    assert.doesNotMatch(getOutput(), /Server listening/);
  } finally {
    await stopProcess(child);
  }
});

async function requestReadiness(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "ok" });
      return;
    } catch (error) {
      lastError = error;
      const remaining = deadline - Date.now();
      if (remaining > 0) {
        await new Promise((resolveWait) =>
          setTimeout(resolveWait, Math.min(100, remaining)),
        );
      }
    }
  }
  throw new Error(`readiness request timed out: ${lastError}`);
}

test("compiled API serves its unauthenticated readiness endpoint", async () => {
  const port = await availablePort();
  const child = spawnApi(port);
  const getOutput = collectOutput(child);

  try {
    await Promise.race([
      requestReadiness(`http://127.0.0.1:${port}/api/healthz`, 20_000),
      once(child, "exit").then(() => {
        assert.fail(`compiled API exited before becoming ready\n${getOutput()}`);
      }),
    ]);
  } finally {
    await stopProcess(child);
  }
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  test(`${signal} lets an active request finish and exits cleanly`, async () => {
    const port = await availablePort();
    const child = spawnApi(port, {
      API_SHUTDOWN_GRACE_PERIOD_MS: "1000",
      API_SHUTDOWN_SMOKE_RESPONSE_DELAY_MS: "250",
      API_SHUTDOWN_SMOKE_LINGERING_TIMER: "1",
    });
    const getOutput = collectOutput(child);

    try {
      await Promise.race([
        requestReadiness(`http://127.0.0.1:${port}/api/healthz`, 20_000),
        once(child, "exit").then(() => {
          assert.fail(`compiled API exited before becoming ready\n${getOutput()}`);
        }),
      ]);

      const activeResponse = await fetch(
        `http://127.0.0.1:${port}/api/shutdown-smoke`,
        { signal: AbortSignal.timeout(2_000) },
      );
      const responseBody = activeResponse.text();

      const startedAt = Date.now();
      child.kill(signal);
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      await assert.rejects(fetch(`http://127.0.0.1:${port}/api/healthz`));

      assert.deepEqual(JSON.parse(await responseBody), { status: "finished" });
      const [exitCode, exitSignal] = await Promise.race([
        once(child, "exit"),
        new Promise((_, rejectTimeout) =>
          setTimeout(() => rejectTimeout(new Error(`shutdown timed out\n${getOutput()}`)), 2_000),
        ),
      ]);

      assert.equal(exitSignal, null);
      assert.equal(exitCode, 0, getOutput());
      assert.ok(Date.now() - startedAt < 1_000);
      assert.match(getOutput(), /Graceful shutdown started/);
    } finally {
      await stopProcess(child);
    }
  });
}

test("shutdown forcibly exits when database cleanup stalls", async () => {
  const port = await availablePort();
  const child = spawnApi(port, {
    API_SHUTDOWN_GRACE_PERIOD_MS: "300",
    API_SHUTDOWN_SMOKE_STALL_POOL: "1",
    API_SHUTDOWN_SMOKE_LINGERING_TIMER: "1",
  });
  const getOutput = collectOutput(child);

  try {
    await Promise.race([
      requestReadiness(`http://127.0.0.1:${port}/api/healthz`, 20_000),
      once(child, "exit").then(() => {
        assert.fail(`compiled API exited before becoming ready\n${getOutput()}`);
      }),
    ]);

    const startedAt = Date.now();
    child.kill("SIGTERM");
    const [exitCode, exitSignal] = await Promise.race([
      once(child, "exit"),
      new Promise((_, rejectTimeout) => {
        setTimeout(() => rejectTimeout(new Error(`shutdown timed out\n${getOutput()}`)), 1_500);
      }),
    ]);

    assert.equal(exitSignal, null);
    assert.equal(exitCode, 1);
    assert.ok(Date.now() - startedAt < 1_500);
    assert.match(getOutput(), /Graceful shutdown deadline reached/);
  } finally {
    await stopProcess(child);
  }
});

test("readiness request deadline covers a stalled response body", async () => {
  let stalledSocket;
  const server = createServer((socket) => {
    stalledSocket = socket;
    socket.write(
      "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n" +
        "Content-Length: 15\r\n\r\n",
    );
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    await assert.rejects(
      requestReadiness(`http://127.0.0.1:${address.port}/api/healthz`, 200),
      /readiness request timed out/,
    );
  } finally {
    const closed = new Promise((resolveClose) => server.close(resolveClose));
    stalledSocket?.destroy();
    await closed;
  }
});
