import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { candidates, consentRecords, customRoles, db, jobHiringTeam } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

const mocks = vi.hoisted(() => ({
  getWorkspaceContext: vi.fn(),
  logAuditEvent: vi.fn(async () => undefined),
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));
vi.mock("@/lib/audit-log", () => ({
  extractRequestMeta: () => ({}),
  logAuditEvent: mocks.logAuditEvent,
}));

import { GET } from "./route";

const describeIntegration = runPipelineIntegration ? describe : describe.skip;

describeIntegration("consent report export scope (integration)", () => {
  let fx: PipelineFixture;
  let inScopeCandidateId: string;
  let outOfScopeCandidateId: string;
  let unassignedCandidateId: string;
  let workspaceId: string;
  let userId: string;

  function contextFor(roleKey: string) {
    return {
      organization: { id: workspaceId },
      user: { id: userId, email: `${userId}@example.test`, name: "Fixture" },
      membership: { id: "member-fixture", role: roleKey },
      role: roleKey,
      roleKey,
      session: {},
    };
  }

  beforeAll(async () => {
    fx = await createPipelineFixture();
    workspaceId = fx.workspaceId;
    userId = fx.userId;

    // Candidate on the job the scoped reviewer is assigned to.
    const inScope = await fx.addApplication({ stageId: fx.stages.applied!.id });
    inScopeCandidateId = inScope.candidateId;

    // Candidate whose only application sits on a job the reviewer is not assigned to.
    const other = await fx.addJob();
    const outOfScope = await fx.addApplication({
      stageId: other.stages.applied!.id,
      jobId: other.jobId,
    });
    outOfScopeCandidateId = outOfScope.candidateId;

    // Candidate with no application at all (talent pool). Hidden from scoped roles.
    const [unassigned] = await db
      .insert(candidates)
      .values({
        workspaceId,
        firstName: "Pool",
        lastName: randomUUID().slice(0, 6),
        email: `pool-${randomUUID()}@example.test`,
      })
      .returning({ id: candidates.id });
    unassignedCandidateId = unassigned.id;

    await db.insert(consentRecords).values([
      { workspaceId, candidateId: inScopeCandidateId, consentType: "data_processing", consentText: "Synthetic", granted: true },
      { workspaceId, candidateId: outOfScopeCandidateId, consentType: "data_processing", consentText: "Synthetic", granted: true },
      { workspaceId, candidateId: unassignedCandidateId, consentType: "marketing", consentText: "Synthetic", granted: true },
    ]);

    await db.insert(jobHiringTeam).values({ workspaceId, jobId: fx.jobId, userId, role: "recruiter" });

    await db.insert(customRoles).values([
      {
        workspaceId,
        key: "dsar-assigned",
        name: "DSAR assigned",
        permissions: ["dsar:manage"],
        scope: { jobAccess: "assigned", departments: [], regions: [] },
      },
      {
        workspaceId,
        key: "dsar-everything",
        name: "DSAR everything",
        permissions: ["dsar:manage"],
        scope: { jobAccess: "all", departments: [], regions: [] },
      },
      {
        workspaceId,
        key: "settings-only",
        name: "Settings only",
        permissions: ["settings:edit"],
        scope: { jobAccess: "all", departments: [], regions: [] },
      },
    ]);
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function request(query = "") {
    return new NextRequest(`https://app.example.test/api/security/consent-report${query}`);
  }

  it("limits a scoped DSAR reviewer to consent records for candidates inside their scope", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(contextFor("dsar-assigned"));

    const response = await GET(request());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { records: Array<{ candidateId: string }> };
    expect(body.records.map((record) => record.candidateId)).toEqual([inScopeCandidateId]);
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "consent_report.exported", metadata: expect.objectContaining({ count: 1 }) }),
    );
  });

  it("applies the scope to CSV exports as well", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(contextFor("dsar-assigned"));

    const response = await GET(request("?format=csv"));

    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain(inScopeCandidateId);
    expect(csv).not.toContain(outOfScopeCandidateId);
    expect(csv).not.toContain(unassignedCandidateId);
  });

  it("gives an unrestricted DSAR reviewer every consent record in the workspace", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(contextFor("dsar-everything"));

    const response = await GET(request());

    const body = (await response.json()) as { records: Array<{ candidateId: string }> };
    expect(body.records.map((record) => record.candidateId).sort()).toEqual(
      [inScopeCandidateId, outOfScopeCandidateId, unassignedCandidateId].sort(),
    );
  });

  it("gives the owner every consent record in the workspace", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(contextFor("owner"));

    const response = await GET(request());

    const body = (await response.json()) as { records: unknown[] };
    expect(body.records).toHaveLength(3);
  });

  it("refuses a settings editor without dsar:manage and returns no records", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(contextFor("settings-only"));

    const response = await GET(request());

    expect(response.status).toBe(403);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("records");
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });
});
