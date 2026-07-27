import "dotenv/config";

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db, member, account, apiKeys, organization, sql, user } from "@harly/db";
import { generateApiKey } from "@harly/api";
import { eq } from "drizzle-orm";

// Node's fetch reports an asynchronous UND_ERR_SOCKET after an intentionally
// canceled long-lived SSE body. The proxy and application have already
// handled the disconnect; keep that expected client-side close out of the
// smoke-test process while surfacing every other uncaught exception.
process.on("uncaughtException", (error) => {
  if (error instanceof Error && error.message === "terminated") return;
  throw error;
});

const APP = process.env.HARLY_TEST_APP ?? "http://127.0.0.1:3000";
const PROXY = "http://127.0.0.1:3100";
const WORKSPACE = "seed-org-local";
const password = "RealtimeTestPassword123!";

async function provision(email: string) {
  const id = `realtime-${randomUUID()}`;
  const now = new Date();
  await db.insert(user).values({ id, name: email, email, emailVerified: true, createdAt: now, updatedAt: now });
  await db.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(password), createdAt: now, updatedAt: now });
  await db.insert(member).values({ id: randomUUID(), organizationId: WORKSPACE, userId: id, role: "owner", createdAt: now });

  const response = await fetch(`${APP}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`sign-in failed for ${email}: ${response.status} ${await response.text()}`);
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith("better-auth.session_token="));
  if (!cookie) throw new Error(`no session cookie for ${email}`);
  return cookie.split(";", 1)[0];
}

async function startProxy() {
  const server = createServer(async (request, response) => {
    try {
      const body = await new Promise<Buffer>((resolve) => {
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => resolve(Buffer.concat(chunks)));
      });
      const upstream = await fetch(`${APP}${request.url}`, {
        method: request.method,
        headers: request.headers as unknown as HeadersInit,
        body: body.length > 0 ? new Uint8Array(body) : undefined,
      });
      const forwardedHeaders = Object.fromEntries(
        [...upstream.headers].filter(
          ([name]) => !["content-encoding", "content-length", "transfer-encoding"].includes(name),
        ),
      );
      response.writeHead(upstream.status, forwardedHeaders);
      if (upstream.body) {
        const reader = upstream.body.getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          response.write(value);
        }
      }
      response.end();
    } catch {
      if (!response.destroyed) response.destroy();
    }
  });
  await new Promise<void>((resolve) => server.listen(3100, "127.0.0.1", resolve));
  return server;
}

async function waitForEvent(cookie: string, eventName: string, timeoutMs = 10_000) {
  const response = await fetch(`${PROXY}/api/realtime`, { headers: { cookie } });
  if (!response.ok || !response.body) throw new Error(`SSE failed: ${response.status}`);
  const reader = response.body.getReader();
  const timer = setTimeout(() => void reader.cancel(), timeoutMs);
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) throw new Error("SSE closed before event");
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) if (frame.includes(`event: ${eventName}`)) return;
    }
  } finally {
    clearTimeout(timer);
    await reader.cancel();
    reader.releaseLock();
  }
}

async function main() {
  await db.select({ id: organization.id }).from(organization).limit(1);
  const proxy = await startProxy();
  let smokeKeyHash: string | undefined;
  try {
    const cookies = await Promise.all([
      provision(`realtime-a-${Date.now()}@harly.test`),
      provision(`realtime-b-${Date.now()}@harly.test`),
    ]);
    const generatedKey = generateApiKey({ type: "secret", environment: "test" });
    smokeKeyHash = generatedKey.hashedKey;
    await db.insert(apiKeys).values({
      workspaceId: WORKSPACE,
      name: "realtime-http-smoke",
      type: generatedKey.type,
      environment: generatedKey.environment,
      prefix: generatedKey.prefix,
      last4: generatedKey.last4,
      hashedKey: generatedKey.hashedKey,
      scopes: ["candidates:read", "candidates:write"],
    });
    const received = Promise.all(cookies.map((cookie) => waitForEvent(cookie, "domain.invalidate")));
    await new Promise((resolve) => setTimeout(resolve, 500));
    const mutation = await fetch(`${PROXY}/api/v1/candidates`, {
      method: "POST",
      headers: {
        cookie: cookies[0],
        "x-api-key": generatedKey.raw,
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      },
      body: JSON.stringify({
        firstName: "Realtime",
        lastName: `Smoke-${Date.now()}`,
        email: `realtime-candidate-${Date.now()}@harly.test`,
      }),
    });
    if (mutation.status !== 201) {
      throw new Error(`authenticated mutation failed: ${mutation.status} ${await mutation.text()}`);
    }
    await received;

    const count = Number(process.env.HARLY_SSE_CONNECTIONS ?? 100);
    const connections = await Promise.all(Array.from({ length: count }, () => fetch(`${PROXY}/api/realtime`, { headers: { cookie: cookies[0] }, signal: AbortSignal.timeout(5000) })));
    if (connections.some((response) => response.status !== 200)) throw new Error(`load connection failure: ${connections.filter((response) => response.status !== 200).length}`);
    for (const response of connections) response.body?.cancel();
    console.log(`realtime HTTP smoke passed: 2 authenticated sessions + ${count} SSE connections through proxy`);
  } finally {
    if (smokeKeyHash) {
      await db.delete(apiKeys).where(eq(apiKeys.hashedKey, smokeKeyHash));
    }
    proxy.close();
    proxy.closeAllConnections();
    await sql.end({ timeout: 1 });
  }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
