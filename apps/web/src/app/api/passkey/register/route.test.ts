import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  getSession: vi.fn(),
  storeChallenge: vi.fn(),
  consumeChallenge: vi.fn(),
}));

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: mocks.generateRegistrationOptions,
  verifyRegistrationResponse: mocks.verifyRegistrationResponse,
}));
vi.mock("@harly/db", () => ({
  db: { select: mocks.select, insert: mocks.insert },
  passkeys: { userId: "userId" },
}));
vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));
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
});
