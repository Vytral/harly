import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: {
    insert: vi.fn(() => ({ values: () => ({ returning: async () => [{ id: "x" }] }) })),
    update: vi.fn(() => ({
      set: () => ({ where: () => ({ returning: async () => [{ id: "x", ownerId: "u1" }] }) }),
    })),
    delete: vi.fn(() => ({ where: () => ({ returning: async () => [{ id: "x" }] }) })),
  },
  tasks: {},
  activityEvents: {},
  notifications: {},
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createTask, deleteTask, updateTask } from "./actions";

describe("Tasks actions — RBAC (F2-04 / readiness)", () => {
  beforeEach(() => {
    mocks.requirePermission.mockResolvedValue({
      organization: { id: "ws-1" },
      user: { id: "u1", name: "U" },
    });
  });

  it.each([
    ["createTask", () => createTask({ title: "T", ownerId: "u2" })],
    ["updateTask", () => updateTask({ taskId: "x", title: "T2" })],
    ["deleteTask", () => deleteTask("x")],
  ])("%s requires collab:write", async (_name, run) => {
    await run();
    expect(mocks.requirePermission).toHaveBeenCalledWith("collab:write");
  });

  it("blocks the action when the caller lacks permission", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("no permission"));
    const result = await createTask({ title: "T", ownerId: "u2" });
    expect(result.success).toBe(false);
  });
});
