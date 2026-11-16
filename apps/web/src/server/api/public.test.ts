import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  getPublicWorkspace: vi.fn(),
  authenticateApiKey: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@harly/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [{ slug: "keyed" }] }) }),
    }),
  },
  organization: { id: "id", slug: "slug" },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));
vi.mock("@/lib/public-workspace", () => ({ getPublicWorkspace: m.getPublicWorkspace }));
vi.mock("./auth", () => ({ authenticateApiKey: m.authenticateApiKey }));

import { resolvePublicWorkspace } from "./public";

beforeEach(() => vi.clearAllMocks());

describe("resolvePublicWorkspace", () => {
  it("uses the shared public workspace resolver when no key is present", async () => {
    m.getPublicWorkspace.mockResolvedValue({ id: "ws-oldest", slug: "acme" });
    const result = await resolvePublicWorkspace(
      new Request("https://ats.example.test/api/public/v1/jobs"),
    );
    expect(result).toEqual({ workspaceId: "ws-oldest", slug: "acme", key: null });
    expect(m.authenticateApiKey).not.toHaveBeenCalled();
  });

  it("is a 404 when no workspace exists", async () => {
    m.getPublicWorkspace.mockResolvedValue(null);
    await expect(
      resolvePublicWorkspace(new Request("https://ats.example.test/api/public/v1/jobs")),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("scopes to the key's workspace when a key is sent", async () => {
    m.authenticateApiKey.mockResolvedValue({ workspaceId: "ws-key" });
    const result = await resolvePublicWorkspace(
      new Request("https://ats.example.test/api/public/v1/jobs?pk=pk_test"),
    );
    expect(result.workspaceId).toBe("ws-key");
    expect(m.getPublicWorkspace).not.toHaveBeenCalled();
  });
});
