import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getWorkspaceContext: vi.fn(),
  select: vi.fn(),
  logAuditEvent: vi.fn(async () => undefined),
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));
vi.mock("@/lib/audit-log", () => ({
  extractRequestMeta: () => ({ ipAddress: "127.0.0.1", userAgent: "test" }),
  logAuditEvent: mocks.logAuditEvent,
}));
vi.mock("@harly/db", () => ({
  db: { select: mocks.select },
  customRoles: {},
  member: {},
  user: {},
  applications: {},
  candidates: { id: "candidates.id", workspaceId: "candidates.workspaceId", deletedAt: "candidates.deletedAt", email: "candidates.email" },
  consentRecords: {
    id: "consent.id",
    workspaceId: "consent.workspaceId",
    candidateId: "consent.candidateId",
    applicationId: "consent.applicationId",
    consentType: "consent.consentType",
    granted: "consent.granted",
    withdrawnAt: "consent.withdrawnAt",
    ipAddress: "consent.ipAddress",
    createdAt: "consent.createdAt",
  },
  jobs: {},
  jobHiringTeam: {},
  offers: {},
  interviews: {},
}));

import { GET } from "./route";

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

/** A query builder whose every step returns the builder and whose terminal `limit` resolves to `rows`. */
function selectReturning(rows: unknown[]) {
  const builder: Record<string, unknown> = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    orderBy: () => builder,
    limit: async () => rows,
  };
  return builder;
}

const consentRow = {
  id: "consent-1",
  candidateId: "candidate-1",
  candidateEmail: "candidate@example.test",
  applicationId: null,
  consentType: "data_processing",
  granted: true,
  withdrawnAt: null,
  ipAddress: "203.0.113.4",
  createdAt: new Date("2026-06-01T12:00:00.000Z"),
};

describe("consent report export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReset();
    mocks.select.mockReturnValue(selectReturning([]));
  });

  it("refuses a custom role with settings:edit but without dsar:manage, with the 403 body", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(contextFor("settings-editor"));
    mocks.select.mockReturnValue(
      selectReturning([{ permissions: ["settings:edit"], scope: {} }]),
    );

    const response = await GET(new NextRequest("https://app.example.test/api/security/consent-report"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Exporting consent records requires the Review privacy requests permission.",
    });
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it("exports JSON for the owner and records the export in the audit log", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(contextFor("owner"));
    mocks.select.mockReturnValue(selectReturning([consentRow]));

    const response = await GET(new NextRequest("https://app.example.test/api/security/consent-report"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.records).toEqual([
      {
        ...consentRow,
        createdAt: "2026-06-01T12:00:00.000Z",
        withdrawnAt: null,
      },
    ]);
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "consent_report.exported", actorId: "user-1" }),
    );
  });
});
