import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
  requirePermission: vi.fn(),
  requireApplicationPermission: vi.fn(),
  getWorkspaceContext: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
  isNotNull: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: {
    transaction: mocks.transaction,
    select: mocks.select,
  },
  activityEvents: {},
  applications: {},
  applicationStageHistory: {},
  candidatePortalNotifications: {},
  candidates: {},
  jobs: {},
  jobStages: {},
  organization: {},
  workspaceSettings: {},
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));

vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
  requireApplicationPermission: mocks.requireApplicationPermission,
}));

vi.mock("@/server/webhooks/emit", () => ({
  emitWebhookEvent: vi.fn(),
}));

vi.mock("@/server/events/emit", () => ({
  persistDomainEvent: vi.fn(),
  publishPersistedDomainEvents: vi.fn(),
}));

vi.mock("@/lib/email/outbox-processor", () => ({
  enqueueEmailOutbox: vi.fn(),
  processEmailOutbox: vi.fn(),
}));

vi.mock("@/features/pipeline/data", () => ({
  normalizeStageEmailConfig: vi.fn(() => ({ candidateUpdatesEnabled: false })),
}));

vi.mock("@/lib/concurrent", () => ({
  ConcurrencyConflictError: class extends Error {},
  isConcurrencyConflict: vi.fn(() => false),
  withConcurrencyRetry: async (operation: () => Promise<unknown>) => operation(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  bulkMoveApplications,
  updateApplicationStatus,
} from "./actions";

const WORKSPACE_ID = "workspace-1";

function makeSelectReturning(rows: unknown[]) {
  const builder: Record<string, unknown> = {
    from: () => builder,
    where: () => builder,
    limit: async () => rows,
  };
  return builder;
}

describe("pipeline application-scoped authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue(undefined);
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "recruiter-1" },
    });
    mocks.select.mockReturnValue(makeSelectReturning([]));
    mocks.transaction.mockResolvedValue([]);
    mocks.requireApplicationPermission.mockResolvedValue(undefined);
  });

  it("rejects the entire bulk move when one application is outside the recruiter's job scope", async () => {
    mocks.requireApplicationPermission.mockImplementation(
      async (_permission: string, applicationId: string) => {
        if (applicationId === "blocked-application") {
          throw new Error("You are not assigned to this job.");
        }
      },
    );

    const result = await bulkMoveApplications({
      applicationIds: ["allowed-application", "blocked-application"],
      toStageId: "stage-1",
      workspaceId: WORKSPACE_ID,
    });

    expect(result.success).toBe(false);
    expect(mocks.requireApplicationPermission).toHaveBeenCalledWith(
      "candidates:move",
      "allowed-application",
    );
    expect(mocks.requireApplicationPermission).toHaveBeenCalledWith(
      "candidates:move",
      "blocked-application",
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects the entire bulk status update when one application is outside scope", async () => {
    mocks.requireApplicationPermission.mockImplementation(
      async (_permission: string, applicationId: string) => {
        if (applicationId === "blocked-application") {
          throw new Error("You are not assigned to this job.");
        }
      },
    );

    const result = await updateApplicationStatus({
      applicationIds: ["allowed-application", "blocked-application"],
      status: "rejected",
      workspaceId: WORKSPACE_ID,
    });

    expect(result.success).toBe(false);
    expect(mocks.requireApplicationPermission).toHaveBeenCalledWith(
      "candidates:edit",
      "allowed-application",
    );
    expect(mocks.requireApplicationPermission).toHaveBeenCalledWith(
      "candidates:edit",
      "blocked-application",
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("continues a bulk move when every selected application is authorized", async () => {
    const result = await bulkMoveApplications({
      applicationIds: ["allowed-application", "another-allowed-application"],
      toStageId: "stage-1",
      workspaceId: WORKSPACE_ID,
    });

    expect(result.success).toBe(true);
    expect(mocks.requireApplicationPermission).toHaveBeenCalledTimes(2);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});
