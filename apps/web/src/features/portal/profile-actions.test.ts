import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  resolvePortalSession: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  eq: (column: unknown, value: unknown) => [column, value],
  inArray: vi.fn(),
  isNull: (column: unknown) => ["isNull", column],
}));
vi.mock("@harly/db", () => ({
  candidates: {
    id: "candidate.id",
    workspaceId: "candidate.workspaceId",
    deletedAt: "candidate.deletedAt",
  },
  db: {
    update: () => ({
      set: (value: unknown) => {
        mocks.set(value);
        return {
          where: (value: unknown) => {
            mocks.where(value);
            return { returning: mocks.returning };
          },
        };
      },
    }),
  },
  dsarRequests: {},
}));
vi.mock("@/lib/portal-auth", () => ({
  PORTAL_SESSION_COOKIE: "portal-session",
  resolvePortalSession: mocks.resolvePortalSession,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

import { updatePortalEmailPreferenceAction } from "./profile-actions";

vi.mock("next-intl/server", async () => (await import("@/test-support/intl-server-mock")).intlServerMock);

const SESSION = {
  candidateId: "candidate-1",
  workspaceId: "workspace-1",
  firstName: "Casey",
  lastName: "Doe",
  email: "casey@example.test",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookies.mockResolvedValue({
    get: () => ({ value: "portal-token" }),
  });
  mocks.resolvePortalSession.mockResolvedValue(SESSION);
  mocks.returning.mockResolvedValue([{ id: SESSION.candidateId }]);
});

describe("updatePortalEmailPreferenceAction", () => {
  it("saves a normalized locale only for the candidate in the portal session", async () => {
    const result = await updatePortalEmailPreferenceAction({
      preferredEmailLocale: " PT-br ",
      candidateId: "attacker-chosen-id",
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.set).toHaveBeenCalledWith({
      preferredEmailLocale: "pt-BR",
      updatedAt: expect.any(Date),
    });
    expect(mocks.where).toHaveBeenCalledWith([
      ["candidate.id", SESSION.candidateId],
      ["candidate.workspaceId", SESSION.workspaceId],
      ["isNull", "candidate.deletedAt"],
    ]);
  });

  it("clears the saved locale when null is submitted", async () => {
    await expect(
      updatePortalEmailPreferenceAction({ preferredEmailLocale: null }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.set).toHaveBeenCalledWith({
      preferredEmailLocale: null,
      updatedAt: expect.any(Date),
    });
  });

  it("rejects unsupported locales without writing", async () => {
    await expect(
      updatePortalEmailPreferenceAction({ preferredEmailLocale: "pt-PT" }),
    ).resolves.toMatchObject({ ok: false });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("requires the authenticated portal session", async () => {
    mocks.cookies.mockResolvedValue({ get: () => undefined });
    await expect(
      updatePortalEmailPreferenceAction({ preferredEmailLocale: "es" }),
    ).resolves.toEqual({ ok: false, error: "Unauthorized." });
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
