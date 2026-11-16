import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  createSession: vi.fn(),
  findUserById: vi.fn(),
  enforceRateLimit: vi.fn(),
  storeChallenge: vi.fn(),
  consumeChallenge: vi.fn(),
  eq: vi.fn((field, value) => ({ field, value })),
  demoMode: { value: false },
}));
vi.mock("@harly/config", () => ({ isDemoMode: () => mocks.demoMode.value }));

vi.mock("@simplewebauthn/server", () => ({
  generateAuthenticationOptions: mocks.generateAuthenticationOptions,
  verifyAuthenticationResponse: mocks.verifyAuthenticationResponse,
}));
vi.mock("@harly/db", () => ({
  db: { select: mocks.select, update: mocks.update },
  passkeys: { credentialId: "credentialId", transports: "transports", userId: "userId", id: "id" },
  user: { email: "email", id: "userId" },
}));
vi.mock("drizzle-orm", () => ({
  eq: mocks.eq,
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
      secret: "test-secret",
      options: { session: { cookieCache: { enabled: false } } },
    }),
  },
}));
vi.mock("@/lib/passkey", () => ({
  RP_ID: "harly.test",
  ORIGIN: "https://harly.test",
  storeChallenge: mocks.storeChallenge,
  consumeChallenge: mocks.consumeChallenge,
}));
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.demoMode.value = false;
  });

  it("sets the session cookie without returning the bearer token in JSON", async () => {
    mocks.enforceRateLimit.mockResolvedValue(undefined);
    mocks.storeChallenge.mockResolvedValue({ id: "challenge-id" });
    mocks.consumeChallenge.mockResolvedValue("challenge-1");
    mocks.generateAuthenticationOptions.mockResolvedValue({
      challenge: "challenge-1",
      allowCredentials: [],
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
    const { challengeId, allowCredentials } = await optionsResponse.json();
    expect(challengeId).toBe("challenge-id");
    expect(allowCredentials).toEqual([]);
    expect(mocks.generateAuthenticationOptions).toHaveBeenCalledWith({
      rpID: "harly.test",
      userVerification: "preferred",
      allowCredentials: [],
    });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.storeChallenge).toHaveBeenCalledWith(null, "challenge-1", "login");
    const response = await POST(
      new Request("https://harly.test/api/passkey/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId, id: "credential-1" }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ verified: true });
    expect(mocks.consumeChallenge).toHaveBeenCalledWith("challenge-id", null, "login");
    expect(mocks.createSession).toHaveBeenCalledWith("user-1");
    // better-auth only accepts a signed session cookie. A raw token here would
    // leave the visitor anonymous after a successful WebAuthn assertion.
    const expectedSignature = createHmac("sha256", "test-secret")
      .update("session-secret")
      .digest("base64");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(
      `session_token=${encodeURIComponent(`session-secret.${expectedSignature}`)}`,
    );
    expect(setCookie).not.toMatch(/session_token=session-secret[;,]/);
    expect(setCookie).not.toMatch(/(?:^|;\s*)token=/);
  });

  function legacyRequest(email: string) {
    return new Request("https://harly.test/api/passkey/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "legacy-options", email }),
    }) as never;
  }

  function mockLegacyRows(rows: { credentialId: string }[]) {
    mocks.select.mockReturnValueOnce({
      from: () => ({ innerJoin: () => ({ where: async () => rows }) }),
    });
  }

  async function legacyAllowList(email: string, rows: { credentialId: string }[]) {
    mocks.enforceRateLimit.mockResolvedValue(undefined);
    mocks.storeChallenge.mockResolvedValue({ id: "legacy-challenge-id" });
    mocks.generateAuthenticationOptions.mockImplementation(
      async (input: { allowCredentials: unknown[] }) => ({
        challenge: "legacy-challenge",
        allowCredentials: input.allowCredentials,
      }),
    );
    mockLegacyRows(rows);
    const response = await POST(legacyRequest(email));
    expect(response.status).toBe(200);
    return (await response.json()) as {
      challengeId: string;
      allowCredentials: { id: string; transports?: string[] }[];
    };
  }

  it("offers a legacy credential fallback for the supplied account", async () => {
    const body = await legacyAllowList("  Person@Example.com ", [
      { credentialId: "legacy-credential" },
    ]);

    expect(body.challengeId).toBe("legacy-challenge-id");
    expect(body.allowCredentials.map((c) => c.id)).toContain("legacy-credential");
    expect(mocks.select).toHaveBeenCalledWith({ credentialId: "credentialId" });
    expect(mocks.eq).toHaveBeenCalledWith("email", "person@example.com");
    expect(mocks.storeChallenge).toHaveBeenCalledWith(null, "legacy-challenge", "login");
  });

  it("answers identically-shaped options for known and unknown accounts", async () => {
    const known = await legacyAllowList("known@example.test", [
      { credentialId: "real-credential-a" },
      { credentialId: "real-credential-b" },
    ]);
    const unknown = await legacyAllowList("nobody@example.test", []);

    expect(known.allowCredentials).toHaveLength(unknown.allowCredentials.length);
    expect(unknown.allowCredentials.length).toBeGreaterThan(0);
    for (const credential of [...known.allowCredentials, ...unknown.allowCredentials]) {
      expect(credential.transports).toBeUndefined();
      expect(credential.id).toMatch(/^[A-Za-z0-9_-]+$/);
    }
    // Sorted by id, so a real credential's position reveals nothing.
    const ids = known.allowCredentials.map((c) => c.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("returns the same decoys for the same unknown email on every request", async () => {
    const first = await legacyAllowList("nobody@example.test", []);
    const second = await legacyAllowList("nobody@example.test", []);
    expect(second.allowCredentials).toEqual(first.allowCredentials);
    const other = await legacyAllowList("someone-else@example.test", []);
    expect(other.allowCredentials).not.toEqual(first.allowCredentials);
  });

  it("refuses passkey sign-in on the public demo", async () => {
    mocks.demoMode.value = true;
    const get = await GET(new Request("https://harly.test/api/passkey/login") as never);
    expect(get.status).toBe(403);
    const post = await POST(
      new Request("https://harly.test/api/passkey/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: "c", id: "credential-1" }),
      }) as never,
    );
    expect(post.status).toBe(403);
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.consumeChallenge).not.toHaveBeenCalled();
  });
});
