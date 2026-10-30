import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => ({
  GET: vi.fn<(request: Request) => Promise<Response>>(async () => new Response("handled-get")),
  POST: vi.fn<(request: Request) => Promise<Response>>(async () => new Response("handled-post")),
  persistentCounts: new Map<string, number>(),
  persistentKeys: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@harly/auth/next", () => ({
  toNextJsHandler: () => ({ GET: handlers.GET, POST: handlers.POST }),
}));
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/server/api/ratelimit", async () => {
  const { ApiError } = await import("@harly/api");
  const exceeded = () =>
    new ApiError("rate_limited", "Rate limit exceeded. Slow down and try again shortly.", {
      rateLimit: { limit: 5, remaining: 0, resetAt: 0 },
    });
  return {
    clientIp: () => "203.0.113.5",
    enforceRateLimit: async () => ({ limit: 60, remaining: 59, resetAt: 0 }),
    enforcePersistentRateLimit: async (key: string, options: { limit: number }) => {
      handlers.persistentKeys.push(key);
      const next = (handlers.persistentCounts.get(key) ?? 0) + 1;
      handlers.persistentCounts.set(key, next);
      if (next > options.limit) throw exceeded();
      return { limit: options.limit, remaining: options.limit - next, resetAt: 0 };
    },
  };
});

import { POST } from "./route";

function resetRequest(email: string, path = "/api/auth/request-password-reset") {
  return new Request(`https://app.example.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

async function statusOf(response: Response) {
  return { status: response.status, body: await response.text() };
}

describe("password reset per-recipient throttle", () => {
  beforeEach(() => {
    handlers.persistentCounts.clear();
    handlers.persistentKeys.length = 0;
    handlers.POST.mockClear();
  });

  it("allows five reset requests for one recipient and throttles the sixth", async () => {
    for (let index = 0; index < 5; index++) {
      const response = await POST(resetRequest(index % 2 ? " Ana@Example.com " : "ana@example.com"));
      expect(response.status).toBe(200);
    }
    expect(handlers.POST).toHaveBeenCalledTimes(5);

    const throttled = await POST(resetRequest("ANA@example.com"));
    expect(throttled.status).toBe(429);
    expect(handlers.POST).toHaveBeenCalledTimes(5);
  });

  it("answers a throttled recipient the same way whether or not the account exists", async () => {
    for (let index = 0; index < 5; index++) {
      await POST(resetRequest("known@example.com"));
      await POST(resetRequest("unknown@example.com"));
    }
    const known = await statusOf(await POST(resetRequest("known@example.com")));
    const unknown = await statusOf(await POST(resetRequest("unknown@example.com")));
    expect(known).toEqual(unknown);
    expect(known.status).toBe(429);
  });

  it("keeps the budget per recipient, not shared across addresses", async () => {
    for (let index = 0; index < 5; index++) {
      await POST(resetRequest("first@example.com"));
    }
    const other = await POST(resetRequest("second@example.com"));
    expect(other.status).toBe(200);
  });

  it("does not count other auth requests against the reset budget", async () => {
    for (let index = 0; index < 10; index++) {
      const response = await POST(
        new Request("https://app.example.test/api/auth/sign-in/email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "ana@example.com", password: "x" }),
        }),
      );
      expect(response.status).toBe(200);
    }
    expect(handlers.persistentKeys).toEqual([]);
  });

  it("stores only a hash of the address in the rate-limit key", async () => {
    await POST(resetRequest("Ana@Example.com"));
    const [key] = handlers.persistentKeys;
    expect(key).toMatch(/^auth:password-reset:recipient:[0-9a-f]{64}$/);
    expect(key).not.toContain("ana");
  });

  it("gives the handler the original request body after the throttle reads it", async () => {
    await POST(resetRequest("ana@example.com"));
    const [forwarded] = handlers.POST.mock.calls[0];
    await expect(forwarded.json()).resolves.toEqual({ email: "ana@example.com" });
  });
});
