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
  const child = spawn(process.execPath, [serverEntry], {
    cwd: rootDirectory,
    env: {
      NODE_ENV: "production",
      PORT: String(port),
      API_READINESS_SMOKE: "1",
      DATABASE_URL:
        "postgresql://readiness-smoke:readiness-smoke@127.0.0.1:1/readiness_smoke",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });

  try {
    await Promise.race([
      requestReadiness(`http://127.0.0.1:${port}/api/healthz`, 20_000),
      once(child, "exit").then(() => {
        assert.fail(`compiled API exited before becoming ready\n${output}`);
      }),
    ]);
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
