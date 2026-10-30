import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  logAuditEvent: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@harly/db", () => ({
  db: { insert: mocks.insert },
  workspaceSettings: {
    organizationId: "organizationId",
    gravatarEnabled: "gravatarEnabled",
    updatedAt: "updatedAt",
  },
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock("@/features/demo/assert-not-demo", () => ({ assertNotDemo: vi.fn() }));

import { saveGravatarEnabledAction } from "./gravatar-settings-actions";

describe("saveGravatarEnabledAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.values.mockReturnValue({ onConflictDoUpdate: mocks.onConflictDoUpdate });
    mocks.onConflictDoUpdate.mockResolvedValue([]);
    mocks.requirePermission.mockResolvedValue({
      organization: { id: "ws-1" },
      user: { id: "user-admin", email: "admin@example.test" },
    });
  });

  it("rejects a caller without settings:edit and writes nothing", async () => {
    mocks.requirePermission.mockRejectedValueOnce(
      new Error("Permission denied: settings:edit"),
    );

    await expect(saveGravatarEnabledAction(true)).rejects.toThrow("settings:edit");
    expect(mocks.requirePermission).toHaveBeenCalledWith("settings:edit");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it("stores the workspace-level flag for an authorised admin and records the change", async () => {
    await expect(saveGravatarEnabledAction(true)).resolves.toEqual({ ok: true });

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "ws-1", gravatarEnabled: true }),
    );
    expect(mocks.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ gravatarEnabled: true }),
      }),
    );
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        action: "settings.gravatar_enabled",
      }),
    );
  });

  it("can switch the flag back off", async () => {
    await expect(saveGravatarEnabledAction(false)).resolves.toEqual({ ok: true });
    expect(mocks.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ gravatarEnabled: false }),
      }),
    );
  });

  it("rejects a non-boolean payload without writing", async () => {
    const result = await saveGravatarEnabledAction("yes" as unknown as boolean);
    expect(result.ok).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
