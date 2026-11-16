import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  getSession: vi.fn(),
  storeChallenge: vi.fn(),
  consumeChallenge: vi.fn(),
  requireRecentReauth: vi.fn(),
}));

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: mocks.generateRegistrationOptions,
  verifyRegistrationResponse: mocks.verifyRegistrationResponse,
}));
vi.mock("@harly/db", () => ({
  db: { select: mocks.select, insert: mocks.insert },
  passkeys: { userId: "userId", id: "id" },
  member: { userId: "userId", organizationId: "organizationId" },
}));
vi.mock("drizzle-orm", () => ({ eq: () => ({}), and: () => ({}) }));
vi.mock("@/server/security/reauth", () => ({ requireRecentReauth: mocks.requireRecentReauth }));
vi.mock("@harly/config", () => ({ isDemoMode: () => false }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ error: vi.fn() }) }));
vi.mock("@/lib/passkey", () => ({
  RP_ID: "harly.test",
  RP_NAME: "Harly",
  ORIGIN: "https://harly.test",
  storeChallenge: mocks.storeChallenge,
  consumeChallenge: mocks.consumeChallenge,
}));

import { GET, POST } from "./route";

describe("passkey registration", () => {
  it("requires discoverable credentials and scopes the challenge to its ID", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "user-1", email: "person@example.com", name: "Person" } });
    mocks.select.mockReturnValue({ from: () => ({ where: async () => [] }) });
    mocks.generateRegistrationOptions.mockResolvedValue({ challenge: "registration-challenge" });
    mocks.storeChallenge.mockResolvedValue({ id: "registration-id" });

    const response = await GET(new Request("https://harly.test/api/passkey/register") as never);

    expect(await response.json()).toMatchObject({
      challenge: "registration-challenge",
      challengeId: "registration-id",
    });
    expect(mocks.generateRegistrationOptions).toHaveBeenCalledWith(expect.objectContaining({
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "preferred",
      },
    }));
    expect(mocks.storeChallenge).toHaveBeenCalledWith("user-1", "registration-challenge", "registration");
  });

  it("consumes the exact registration challenge and persists the verified credential", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.consumeChallenge.mockResolvedValue("registration-challenge");
    mocks.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: "credential-1", publicKey: new Uint8Array([1, 2]), counter: 0, transports: ["internal"] },
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
      },
    });
    mocks.insert.mockReturnValue({ values: async () => undefined });

    const response = await POST(new Request("https://harly.test/api/passkey/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeId: "registration-id", response: { id: "credential-1" }, name: "Phone" }),
    }) as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ verified: true });
    expect(mocks.consumeChallenge).toHaveBeenCalledWith("registration-id", "user-1", "registration");
    expect(mocks.insert).toHaveBeenCalled();
  });

  describe("when the user already has a passkey", () => {
    function withExistingPasskey() {
      mocks.getSession.mockResolvedValue({
        user: { id: "user-1" },
        session: { activeOrganizationId: "org-1" },
      });
      mocks.select
        .mockReset()
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ id: "pk-1" }] }) })
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: async () => [{ organizationId: "org-1" }] }) }),
        });
    }

    function post() {
      return POST(new Request("https://harly.test/api/passkey/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: "registration-id", response: { id: "credential-2" } }),
      }) as never);
    }

    it("rejects registration without a fresh passkey reauthentication", async () => {
      vi.clearAllMocks();
      withExistingPasskey();
      mocks.requireRecentReauth.mockResolvedValue(false);

      const response = await post();

      expect(response.status).toBe(403);
      expect(mocks.requireRecentReauth).toHaveBeenCalledWith({
        userId: "user-1",
        workspaceId: "org-1",
        purpose: "sensitive_action",
      });
      expect(mocks.consumeChallenge).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it("proceeds once reauthentication succeeds", async () => {
      vi.clearAllMocks();
      withExistingPasskey();
      mocks.requireRecentReauth.mockResolvedValue(true);
      mocks.consumeChallenge.mockResolvedValue(null);

      const response = await post();

      expect(response.status).toBe(400); // challenge missing, but reauth gate passed
      expect(mocks.consumeChallenge).toHaveBeenCalled();
    });
  });
});
