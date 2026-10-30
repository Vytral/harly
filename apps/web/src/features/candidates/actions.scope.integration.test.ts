import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import { candidateNotes, candidateTags, customRoles, db } from "@harly/db";

import {
  createAuthorizationFixture,
  type AuthorizationFixture,
} from "@/test-support/authorization-fixture";
import { runPipelineIntegration } from "@/test-support/pipeline-fixture";

const ctx = vi.hoisted(() => ({
  workspaceId: "",
  userId: "",
  roleKey: "owner",
}));

const sendCanonicalEmail = vi.hoisted(() =>
  vi.fn<(input: { candidateId: string }) => Promise<void>>(async () => undefined),
);

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/mail/feature-flag", () => ({
  isMailUnificationEnabled: vi.fn(async () => true),
}));
vi.mock("@/lib/mail/send-canonical-email", () => ({ sendCanonicalEmail }));
vi.mock("@/lib/mail/canonical", () => ({ insertCanonicalMessage: vi.fn(async () => undefined) }));
vi.mock("@/lib/email/inbound-token", () => ({ getInboundReplyTo: vi.fn(async () => undefined) }));
vi.mock("@/lib/email", () => ({ getWorkspaceEmailSender: vi.fn(async () => null) }));
vi.mock("@/server/webhooks/emit", () => ({ emitWebhookEvent: vi.fn(async () => undefined) }));
vi.mock("@/server/events/emit", () => ({
  persistDomainEvent: vi.fn(async () => ({})),
  publishPersistedDomainEvents: vi.fn(async () => undefined),
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: ctx.workspaceId, name: "Auth", slug: "auth" },
    user: { id: ctx.userId, email: "auth@example.test", name: "Auth User", image: null },
    membership: { id: "member", role: ctx.roleKey },
    role: ctx.roleKey,
    roleKey: ctx.roleKey,
    session: {},
  })),
  getWorkspaceContextOrNull: vi.fn(async () => null),
}));

import {
  createCandidateNote,
  removeCandidateTag,
  sendBulkCandidateEmail,
} from "./actions";

const COLLAB_PERMISSIONS = [
  "candidates:view",
  "candidates:edit",
  "collab:write",
  "jobs:view",
  "tasks:read",
] as const;

describe.skipIf(!runPipelineIntegration)("candidate notes, tags and bulk email respect candidate scope (database)", () => {
  let fx: AuthorizationFixture;
  let scopedRoleKey: string;
  let fullRoleKey: string;

  function actAs(key: "scoped" | "full") {
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = fx.users[key];
    ctx.roleKey = key === "scoped" ? scopedRoleKey : fullRoleKey;
  }

  async function noteCount(candidateId: string) {
    const rows = await db
      .select({ id: candidateNotes.id })
      .from(candidateNotes)
      .where(eq(candidateNotes.candidateId, candidateId));
    return rows.length;
  }

  async function tagId(candidateId: string) {
    const [row] = await db
      .select({ id: candidateTags.id })
      .from(candidateTags)
      .where(eq(candidateTags.candidateId, candidateId))
      .limit(1);
    return row!.id;
  }

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    const tag = randomUUID().slice(0, 8);
    scopedRoleKey = `collab-scoped-${tag}`;
    fullRoleKey = `collab-full-${tag}`;
    await db.insert(customRoles).values([
      {
        workspaceId: fx.workspaceId,
        key: scopedRoleKey,
        name: "Collaborator, assigned jobs",
        permissions: [...COLLAB_PERMISSIONS],
        scope: { jobAccess: "assigned", departments: [], regions: [] },
      },
      {
        workspaceId: fx.workspaceId,
        key: fullRoleKey,
        name: "Collaborator, all jobs",
        permissions: [...COLLAB_PERMISSIONS],
        scope: { jobAccess: "all", departments: [], regions: [] },
      },
    ]);
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("refuses a job-limited collaborator a note on a candidate outside their jobs", async () => {
    actAs("scoped");
    const before = await noteCount(fx.candidateB);
    const result = await createCandidateNote({
      candidateId: fx.candidateB,
      workspaceId: fx.workspaceId,
      body: "Out of scope note",
    });
    expect(result.success).toBe(false);
    expect(await noteCount(fx.candidateB)).toBe(before);
  });

  it("allows a job-limited collaborator a note on a candidate inside their jobs", async () => {
    actAs("scoped");
    const result = await createCandidateNote({
      candidateId: fx.candidateA,
      workspaceId: fx.workspaceId,
      body: "In scope note",
    });
    expect(result.success).toBe(true);
    expect(await noteCount(fx.candidateA)).toBeGreaterThan(0);
  });

  it("allows an unrestricted collaborator a note on any candidate in the workspace", async () => {
    actAs("full");
    const result = await createCandidateNote({
      candidateId: fx.candidateB,
      workspaceId: fx.workspaceId,
      body: "Unrestricted note",
    });
    expect(result.success).toBe(true);
  });

  it("does not let a tag removal delete a tag that belongs to another candidate", async () => {
    actAs("scoped");
    const otherCandidateTag = await tagId(fx.candidateB);
    const result = await removeCandidateTag({
      tagId: otherCandidateTag,
      candidateId: fx.candidateA,
      workspaceId: fx.workspaceId,
    });
    expect(result.success).toBe(true);
    const [still] = await db
      .select({ id: candidateTags.id })
      .from(candidateTags)
      .where(and(eq(candidateTags.id, otherCandidateTag), eq(candidateTags.candidateId, fx.candidateB)));
    expect(still?.id).toBe(otherCandidateTag);
  });

  it("emails only the candidates the caller can see in the bulk send", async () => {
    sendCanonicalEmail.mockClear();
    actAs("scoped");
    const result = await sendBulkCandidateEmail({
      candidateIds: [fx.candidateA, fx.candidateB],
      subject: "Hello",
      body: "Hi {{candidate_first_name}}",
    });
    expect(result.success).toBe(true);
    const recipients = sendCanonicalEmail.mock.calls.map((call) => call[0].candidateId);
    expect(recipients).toContain(fx.candidateA);
    expect(recipients).not.toContain(fx.candidateB);
  });
});
