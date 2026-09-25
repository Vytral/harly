import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  getSession: vi.fn(),
  storeChallenge: vi.fn(),
  consumeChallenge: vi.fn(),
  issueReauthToken: vi.fn(),
}));

vi.mock("@simplewebauthn/server", () => ({
  generateAuthenticationOptions: mocks.generateAuthenticationOptions,
  verifyAuthenticationResponse: mocks.verifyAuthenticationResponse,
}));
vi.mock("@harly/db", () => ({
  db: { select: mocks.select, update: mocks.update },
  member: { organizationId: "organizationId", userId: "userId" },
  passkeys: { credentialId: "credentialId", userId: "userId", id: "id" },
}));
vi.mock("drizzle-orm", () => ({ and: () => ({}), eq: () => ({}) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ error: vi.fn() }) }));
vi.mock("@/lib/passkey", () => ({
  RP_ID: "harly.test",
  ORIGIN: "https://harly.test",
  storeChallenge: mocks.storeChallenge,
  consumeChallenge: mocks.consumeChallenge,
}));
vi.mock("@/server/security/reauth", () => ({ issueReauthToken: mocks.issueReauthToken }));

import { GET, POST } from "./route";

function selectChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => Object.assign([...rows], { limit: async () => rows }),
    }),
  };
}

describe("authenticated passkey re-authentication", () => {
  it("keeps separate outstanding challenges isolated and verifies the selected one", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { activeOrganizationId: null },
    });
    mocks.select
      .mockReturnValueOnce(selectChain([{ credentialId: "credential-1", transports: null }]))
      .mockReturnValueOnce(selectChain([{ credentialId: "credential-1", transports: null }]))
      .mockReturnValueOnce(selectChain([{
        id: "passkey-1",
        userId: "user-1",
        credentialId: "credential-1",
        credentialPublicKey: Buffer.from([1, 2]).toString("base64url"),
        counter: 1,
        transports: null,
      }]))
      .mockReturnValueOnce(selectChain([]));
    mocks.generateAuthenticationOptions
      .mockResolvedValueOnce({ challenge: "first" })
      .mockResolvedValueOnce({ challenge: "second" });
    mocks.storeChallenge
      .mockResolvedValueOnce({ id: "first-id" })
      .mockResolvedValueOnce({ id: "second-id" });
    mocks.consumeChallenge.mockResolvedValue("second");
    mocks.verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 2 },
    });
    mocks.update.mockReturnValue({ set: () => ({ where: async () => undefined }) });

    const firstOptions = await GET(new Request("https://harly.test/api/passkey/authenticate") as never);
    const secondOptions = await GET(new Request("https://harly.test/api/passkey/authenticate") as never);
    expect((await firstOptions.json()).challengeId).toBe("first-id");
    expect((await secondOptions.json()).challengeId).toBe("second-id");

    const response = await POST(new Request("https://harly.test/api/passkey/authenticate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeId: "second-id", id: "credential-1", response: {} }),
    }) as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ verified: true });
    expect(mocks.consumeChallenge).toHaveBeenCalledWith("second-id", "user-1", "authentication");
    expect(mocks.verifyAuthenticationResponse).toHaveBeenCalledWith(expect.objectContaining({
      expectedChallenge: "second",
      response: { id: "credential-1", response: {} },
    }));
  });
});
