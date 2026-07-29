import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  createSession: vi.fn(),
  findUserById: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@simplewebauthn/server", () => ({
  generateAuthenticationOptions: mocks.generateAuthenticationOptions,
  verifyAuthenticationResponse: mocks.verifyAuthenticationResponse,
}));
vi.mock("@harly/db", () => ({
  db: { select: mocks.select, update: mocks.update },
  passkeys: { credentialId: "credentialId", id: "id" },
}));
vi.mock("drizzle-orm", () => ({
  eq: () => ({ operator: "eq" }),
}));
vi.mock("@/lib/auth", () => ({
  auth: {
    $context: Promise.resolve({
      internalAdapter: {
        createSession: mocks.createSession,
        findUserById: mocks.findUserById,
      },
      authCookies: {
        sessionToken: {
          name: "session_token",
          attributes: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
        },
        sessionData: {
          name: "session_data",
          attributes: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
        },
      },
      sessionConfig: { expiresIn: 3600 },
      options: { session: { cookieCache: { enabled: false } } },
    }),
  },
}));
vi.mock("@/lib/passkey", () => ({ RP_ID: "harly.test", ORIGIN: "https://harly.test" }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ error: vi.fn() }) }));
vi.mock("@/server/api/ratelimit", () => ({
  clientIp: () => "127.0.0.1",
  enforceRateLimit: mocks.enforceRateLimit,
}));

import { GET, POST } from "./route";

function selectChain(result: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        limit: async () => result,
      }),
    }),
  };
}

describe("passkey login", () => {
  it("sets the session cookie without returning the bearer token in JSON", async () => {
    mocks.enforceRateLimit.mockResolvedValue(undefined);
    mocks.generateAuthenticationOptions.mockResolvedValue({
      challenge: "challenge-1",
      allowCredentials: [],
    });
    mocks.select.mockReturnValueOnce({
      from: async () => [],
    });
    mocks.select.mockReturnValueOnce(
      selectChain([
        {
          id: "passkey-1",
          userId: "user-1",
          credentialId: "credential-1",
          credentialPublicKey: Buffer.alloc(32).toString("base64url"),
          counter: 1,
          transports: null,
        },
      ]),
    );
    mocks.update.mockReturnValue({
      set: () => ({ where: async () => undefined }),
    });
    mocks.verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 2 },
    });
    mocks.createSession.mockResolvedValue({
      token: "session-secret",
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    mocks.findUserById.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      name: "Owner",
      image: null,
    });

    const optionsResponse = await GET(new Request("https://harly.test/api/passkey/login") as never);
    const { challengeId } = await optionsResponse.json();
    const response = await POST(
      new Request("https://harly.test/api/passkey/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId, id: "credential-1" }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ verified: true });
    expect(response.headers.get("set-cookie")).toContain("session_token=session-secret");
    expect(response.headers.get("set-cookie")).not.toMatch(/(?:^|;\s*)token=/);
  });
});
