import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import { applications, db, jobStages, scorecards } from "@harly/db";

import { createAuthorizationFixture, type AuthorizationFixture } from "@/test-support/authorization-fixture";
import { runPipelineIntegration } from "@/test-support/pipeline-fixture";

const ctx = vi.hoisted(() => ({ workspaceId: "", userId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: ctx.workspaceId, name: "Auth", slug: "auth" },
    user: { id: ctx.userId, email: "auth@example.test", name: "Auth User", image: null },
    membership: { id: "member", role: "owner" },
    role: "owner",
    roleKey: "owner",
    session: {},
  })),
  getWorkspaceContextOrNull: vi.fn(async () => null),
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requireCandidatePermission: vi.fn(async () => ({})),
  requirePermission: vi.fn(async () => ({})),
  requireJobPermission: vi.fn(async () => ({})),
}));
vi.mock("@/lib/ai/config", () => ({ getWorkspaceAiConfig: vi.fn() }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/server/webhooks/emit", () => ({ emitWebhookEvent: vi.fn() }));
vi.mock("@/server/events/emit", () => ({
  persistDomainEvent: vi.fn(),
  publishPersistedDomainEvents: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { createScorecard } from "./actions";

describe.skipIf(!runPipelineIntegration)("UI scorecard writer and archived stages (database)", () => {
  let fx: AuthorizationFixture;
  let applicationId: string;
  let archivedStageId: string;

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = fx.users.full;
    const [app] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.candidateId, fx.candidateA));
    applicationId = app!.id;
    const [archived] = await db
      .select({ id: jobStages.id })
      .from(jobStages)
      .where(and(eq(jobStages.jobId, fx.jobA), eq(jobStages.name, fx.archivedStageName)));
    archivedStageId = archived!.id;
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("rejects an archived stage id and stores nothing against it", async () => {
    const result = await createScorecard({
      candidateId: fx.candidateA,
      workspaceId: fx.workspaceId,
      applicationId,
      stageId: archivedStageId,
      rating: "weak",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/archived/i);
    const stored = await db
      .select({ id: scorecards.id })
      .from(scorecards)
      .where(eq(scorecards.stageId, archivedStageId));
    expect(stored).toHaveLength(0);
  });

  it("files a scorecard against an active stage", async () => {
    const screening = fx.stagesA.screening!;
    const result = await createScorecard({
      candidateId: fx.candidateA,
      workspaceId: fx.workspaceId,
      applicationId,
      stageId: screening.id,
      rating: "mixed",
      comment: `synthetic ${randomUUID().slice(0, 6)}`,
    });

    expect(result).toEqual({ success: true });
    const [row] = await db
      .select({ stageName: scorecards.stageName })
      .from(scorecards)
      .where(eq(scorecards.stageId, screening.id));
    expect(row?.stageName).toBe(screening.name);
  });
});
