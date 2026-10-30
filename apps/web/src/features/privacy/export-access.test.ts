import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceContext: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));
vi.mock("@harly/db", () => ({
  db: { select: mocks.select, update: vi.fn(), insert: vi.fn(), delete: vi.fn() },
  customRoles: {},
  member: {},
  user: {},
  applications: {},
  candidates: {},
  offers: {},
  interviews: {},
  jobHiringTeam: {},
  jobs: {},
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { ApiError } from "@harly/api";

import { requireDsarExport } from "./export-access";

function contextFor(roleKey: string) {
  return {
    organization: { id: "workspace-1" },
    user: { id: "user-1", email: "reviewer@example.test", name: "Reviewer" },
    membership: { id: "member-1", role: roleKey },
    role: roleKey,
    roleKey,
    session: {},
  };
}

function selectReturning(rows: unknown[]) {
  const builder: Record<string, unknown> = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: async () => rows,
  };
  return builder;
}

describe("requireDsarExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue(selectReturning([]));
  });

  it("refuses a custom settings editor who lacks dsar:manage, with a 403 ApiError", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(contextFor("settings-editor"));
    mocks.select.mockReturnValue(
      selectReturning([{ permissions: ["settings:edit"], scope: {} }]),
    );

    const error = await requireDsarExport("Exporting requires dsar:manage.").catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, message: "Exporting requires dsar:manage." });
  });

  it("admits a custom role that holds dsar:manage and returns its scope for the caller", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(contextFor("dsar-reviewer"));
    mocks.select.mockReturnValue(
      selectReturning([
        {
          permissions: ["dsar:manage"],
          scope: { jobAccess: "assigned", departments: ["Engineering"], regions: [] },
        },
      ]),
    );

    const access = await requireDsarExport("unused");
    expect(access.context.organization.id).toBe("workspace-1");
    expect(access.actor).toEqual({
      workspaceId: "workspace-1",
      userId: "user-1",
      permissions: ["dsar:manage"],
      scope: { jobAccess: "assigned", departments: ["Engineering"], regions: [] },
    });
  });

  it("admits the owner and the built-in admin, which hold dsar:manage by default", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(contextFor("owner"));
    await expect(requireDsarExport("unused")).resolves.toMatchObject({
      actor: { permissions: expect.arrayContaining(["dsar:manage"]) },
    });

    mocks.getWorkspaceContext.mockResolvedValue(contextFor("admin"));
    await expect(requireDsarExport("unused")).resolves.toMatchObject({
      actor: { permissions: expect.arrayContaining(["dsar:manage"]) },
    });
  });

  it("refuses a built-in admin whose stored override dropped dsar:manage", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(contextFor("admin"));
    mocks.select.mockReturnValue(
      selectReturning([{ permissions: ["settings:edit"], scope: {} }]),
    );
    await expect(requireDsarExport("Exporting requires dsar:manage.")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("refuses a hiring manager, who has no dsar:manage by default", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(contextFor("hiring_manager"));
    await expect(requireDsarExport("Exporting requires dsar:manage.")).rejects.toMatchObject({
      status: 403,
    });
  });
});
