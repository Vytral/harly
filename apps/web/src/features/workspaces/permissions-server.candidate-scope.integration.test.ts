import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { auditLogs, candidates, customRoles, db, user } from "@harly/db";

import {
  RECRUITER_PERMISSIONS,
  createAuthorizationFixture,
  type ActorKey,
  type AuthorizationFixture,
} from "@/test-support/authorization-fixture";
import { runPipelineIntegration } from "@/test-support/pipeline-fixture";

const ctx = vi.hoisted(() => ({
  workspaceId: "",
  userId: "",
  roleKey: "owner",
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

import { requireCandidatePermission } from "./permissions-server";

describe.skipIf(!runPipelineIntegration)(
  "requireCandidatePermission: candidates without applications (database)",
  () => {
    let fx: AuthorizationFixture;
    const tag = randomUUID().slice(0, 8);
    const legalUserId = `legal-user-${tag}`;
    const legalRoleKey = `legal-${tag}`;
    // Candidate created by the Legal-restricted recruiter, with no application yet.
    let ownCandidate: string;
    // Candidate created by someone else, with no application yet.
    let foreignCandidate: string;

    function actAs(key: ActorKey | "legal") {
      ctx.workspaceId = fx.workspaceId;
      if (key === "legal") {
        ctx.userId = legalUserId;
        ctx.roleKey = legalRoleKey;
        return;
      }
      ctx.userId = fx.users[key];
      ctx.roleKey = fx.roleKeys[key];
    }

    async function insertCandidate(label: string) {
      const [row] = await db
        .insert(candidates)
        .values({
          workspaceId: fx.workspaceId,
          firstName: label,
          lastName: `Unapplied ${tag}`,
          email: `${randomUUID()}@example.test`,
        })
        .returning({ id: candidates.id });
      return row.id;
    }

    beforeAll(async () => {
      fx = await createAuthorizationFixture();
      await db.insert(user).values({
        id: legalUserId,
        name: `Legal ${tag}`,
        email: `${legalUserId}@example.test`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // Job-wide access, but only to Legal jobs: the same restriction the
      // candidate directory applies.
      await db.insert(customRoles).values({
        workspaceId: fx.workspaceId,
        key: legalRoleKey,
        name: "Legal only",
        permissions: [...RECRUITER_PERMISSIONS, "candidates:edit"],
        scope: { jobAccess: "all", departments: ["Legal"], regions: [] },
      });

      ownCandidate = await insertCandidate("Own");
      foreignCandidate = await insertCandidate("Foreign");
      await db.insert(auditLogs).values([
        {
          workspaceId: fx.workspaceId,
          actorId: legalUserId,
          action: "candidate.created",
          resourceType: "candidate",
          resourceId: ownCandidate,
          severity: "info",
        },
        {
          workspaceId: fx.workspaceId,
          actorId: fx.users.full,
          action: "candidate.created",
          resourceType: "candidate",
          resourceId: foreignCandidate,
          severity: "info",
        },
      ]);
    });

    afterAll(async () => {
      if (fx) {
        await db.delete(auditLogs).where(eq(auditLogs.workspaceId, fx.workspaceId));
        await db.delete(user).where(eq(user.id, legalUserId));
        await fx.cleanup();
      }
    });

    beforeEach(() => {
      ctx.workspaceId = fx.workspaceId;
    });

    it("refuses a department-restricted caller a candidate it did not create and that has no application", async () => {
      actAs("legal");
      await expect(
        requireCandidatePermission("candidates:view", foreignCandidate),
      ).rejects.toThrow("Candidate is not assigned to a job.");
      await expect(
        requireCandidatePermission("candidates:edit", foreignCandidate),
      ).rejects.toThrow("Candidate is not assigned to a job.");
    });

    it("lets the department-restricted creator view and edit the candidate it just created", async () => {
      actAs("legal");
      await expect(
        requireCandidatePermission("candidates:edit", ownCandidate),
      ).resolves.toMatchObject({ user: { id: legalUserId } });
    });

    it("keeps unrestricted roles unchanged for candidates without applications", async () => {
      actAs("full");
      await expect(
        requireCandidatePermission("candidates:view", foreignCandidate),
      ).resolves.toBeDefined();
    });

    it("keeps assigned-only callers refused for candidates without applications, even their own", async () => {
      actAs("scoped");
      await expect(
        requireCandidatePermission("candidates:view", foreignCandidate),
      ).rejects.toThrow("Candidate is not assigned to a job.");
    });
  },
);
