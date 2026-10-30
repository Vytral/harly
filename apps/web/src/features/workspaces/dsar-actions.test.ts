import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getRolePolicy: vi.fn(),
  where: vi.fn(),
  select: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock("@/features/candidates/data", () => ({
  permanentlyDeleteCandidate: vi.fn(),
  trashCandidate: vi.fn(),
}));
vi.mock("@/features/candidates/deletion-jobs", () => ({
  enqueueCandidateDeletionJob: vi.fn(),
  markCandidateDeletionBlocked: vi.fn(),
  markCandidateDeletionCompleted: vi.fn(),
  markCandidateDeletionFailed: vi.fn(),
  startCandidateDeletionJob: vi.fn(),
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
  getRolePolicy: mocks.getRolePolicy,
}));
// Stand-in for the scope predicate: a restricted scope yields a marker, unrestricted none.
vi.mock("@/features/search/scope", () => ({
  candidateScopeSql: (actor: { scope: { jobAccess: string; departments: string[]; regions: string[] } }) =>
    actor.scope.jobAccess === "all" && actor.scope.departments.length === 0 && actor.scope.regions.length === 0
      ? undefined
      : "CANDIDATE_SCOPE",
}));
vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("drizzle-orm")>()),
  // Record the predicates a query combines, so the test can see the scope predicate.
  and: (...conditions: unknown[]) => ({ conditions }),
}));
vi.mock("@harly/db", () => {
  const builder: Record<string, unknown> = {};
  return {
    candidates: { id: "candidates.id", workspaceId: "candidates.workspaceId", deletedAt: "candidates.deletedAt" },
    dsarRequests: {
      id: "dsar.id",
      candidateId: "dsar.candidateId",
      workspaceId: "dsar.workspaceId",
      createdAt: "dsar.createdAt",
    },
    db: { select: mocks.select, _builder: builder },
  };
});

import { getDsarRequests } from "./dsar-actions";

const RESTRICTED = { jobAccess: "assigned", departments: [], regions: [] };
const UNRESTRICTED = { jobAccess: "all", departments: [], regions: [] };

/** The predicates a `where` call received; a lone predicate counts as one. */
function conditionsOf(predicate: unknown): unknown[] {
  const combined = predicate as { conditions?: unknown[] } | undefined;
  return combined?.conditions ?? [predicate];
}

function useRole(scope: typeof RESTRICTED) {
  mocks.requirePermission.mockResolvedValue({
    organization: { id: "ws-1" },
    roleKey: "dsar-reviewer",
    user: { id: "user-1" },
  });
  mocks.getRolePolicy.mockResolvedValue({ permissions: ["dsar:manage"], scope });
}

describe("getDsarRequests scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const builder = {
      from: () => builder,
      leftJoin: () => builder,
      where: (...args: unknown[]) => {
        mocks.where(...args);
        return builder;
      },
      orderBy: async () => [],
    };
    mocks.select.mockReturnValue(builder);
  });

  it("limits the request list to candidates inside a restricted role's scope", async () => {
    useRole(RESTRICTED);

    await getDsarRequests();

    expect(mocks.where).toHaveBeenCalledTimes(1);
    expect(conditionsOf(mocks.where.mock.calls[0]![0])).toContain("CANDIDATE_SCOPE");
  });

  it("applies no candidate filter to an unrestricted role", async () => {
    useRole(UNRESTRICTED);

    await getDsarRequests();

    expect(conditionsOf(mocks.where.mock.calls[0]![0])).not.toContain("CANDIDATE_SCOPE");
  });
});
