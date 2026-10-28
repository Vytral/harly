import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  metadata: null as string | null,
  getWorkspaceContext: vi.fn(async () => ({ organization: { id: "org-1" } })),
}));

vi.mock("@harly/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ metadata: mocks.metadata }] }),
      }),
    }),
  },
  organization: { id: "id", metadata: "metadata" },
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));

import { serializeSandboxMetadata } from "./sandbox-metadata";
import { assertNotDemoOutsideSandbox, isLiveSandboxWorkspace } from "./sandbox-access";

const live = () =>
  serializeSandboxMetadata({ expiresAt: new Date(Date.now() + 3_600_000).toISOString(), style: "", ownerUserId: null });
const expired = () =>
  serializeSandboxMetadata({ expiresAt: new Date(Date.now() - 1_000).toISOString(), style: "", ownerUserId: null });

describe("sandbox access", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mocks.metadata = null;
    vi.clearAllMocks();
  });

  it("recognises only live sandboxes", async () => {
    mocks.metadata = live();
    expect(await isLiveSandboxWorkspace("org-1")).toBe(true);
    mocks.metadata = expired();
    expect(await isLiveSandboxWorkspace("org-1")).toBe(false);
    mocks.metadata = null;
    expect(await isLiveSandboxWorkspace("org-1")).toBe(false);
  });

  it("is a no-op outside demo mode without touching the database", async () => {
    await expect(assertNotDemoOutsideSandbox()).resolves.toBeUndefined();
    expect(mocks.getWorkspaceContext).not.toHaveBeenCalled();
  });

  it("allows a live sandbox in demo mode", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    mocks.metadata = live();
    await expect(assertNotDemoOutsideSandbox()).resolves.toBeUndefined();
  });

  it("still blocks the template workspace and expired sandboxes in demo mode", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    mocks.metadata = null;
    await expect(assertNotDemoOutsideSandbox()).rejects.toThrow("disabled in the demo");
    mocks.metadata = expired();
    await expect(assertNotDemoOutsideSandbox()).rejects.toThrow("disabled in the demo");
  });
});
