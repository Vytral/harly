import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  live: true,
  getSession: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/features/demo/sandbox-state", () => ({
  isLiveSandboxWorkspace: async () => mocks.live,
}));
vi.mock("@harly/db", () => {
  const row = {
    organizationId: "org-1",
    name: "Syntrix",
    slug: "sbx-1",
    logo: null,
    memberId: "m-1",
    role: "owner",
  };
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.innerJoin = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.limit = async () => [row];
  return {
    db: { select: () => chain },
    member: {},
    organization: {},
  };
});

import { getWorkspaceContext, getWorkspaceContextOrNull } from "./context";

describe("workspace context in the public demo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mocks.live = true;
  });

  function signedIn() {
    mocks.getSession.mockResolvedValue({
      session: { activeOrganizationId: "org-1" },
      user: { id: "user-1" },
    });
  }

  it("resolves a live sandbox", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    signedIn();
    const context = await getWorkspaceContext();
    expect(context.organization.id).toBe("org-1");
  });

  it("treats an expired sandbox or the shared template as signed out, for pages and actions alike", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    signedIn();
    mocks.live = false;
    expect(await getWorkspaceContextOrNull()).toBeNull();
    await expect(getWorkspaceContext()).rejects.toThrow("redirect:/enter");
  });

  it("does not consult sandboxes on normal installs", async () => {
    signedIn();
    mocks.live = false;
    const context = await getWorkspaceContext();
    expect(context.organization.id).toBe("org-1");
  });
});
