import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import { db, jobs } from "@harly/db";

import { createPipelineFixture, runPipelineIntegration, type PipelineFixture } from "@/test-support/pipeline-fixture";

const ctx = vi.hoisted(() => ({ workspaceId: "", userId: "" }));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: ctx.workspaceId, name: "Fixture", slug: "fixture" },
    user: { id: ctx.userId, email: "fixture@example.test", name: "Fixture User", image: null },
    membership: { id: "member", role: "owner" },
    role: "owner",
    roleKey: "owner",
    session: {},
  })),
  getWorkspaceContextOrNull: vi.fn(async () => null),
}));

import { generateUniqueJobSlug, restoreJob } from "./data";

describe.skipIf(!runPipelineIntegration)("restoreJob slug collisions (database)", () => {
  let fx: PipelineFixture;

  beforeAll(async () => {
    fx = await createPipelineFixture();
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = fx.userId;
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  async function insertJob(slug: string, deletedAt: Date | null) {
    const [row] = await db
      .insert(jobs)
      .values({
        workspaceId: fx.workspaceId,
        title: "Backend Engineer",
        slug,
        employmentType: "full_time",
        workplaceType: "remote",
        description: "Synthetic job",
        createdById: fx.userId,
        deletedAt,
      })
      .returning({ id: jobs.id });
    return row!.id;
  }

  it("lets a new job reuse the slug of a trashed job and restores the trashed one under a fresh slug", async () => {
    const slug = `backend-${randomUUID().slice(0, 8)}`;
    const trashedId = await insertJob(slug, new Date());
    expect(await generateUniqueJobSlug(fx.workspaceId, slug)).toBe(slug);
    const liveId = await insertJob(slug, null);

    const result = await restoreJob(trashedId);
    expect(result).toMatchObject({ ok: true, slugChanged: true });

    const [trashed] = await db.select().from(jobs).where(eq(jobs.id, trashedId));
    const [live] = await db.select().from(jobs).where(eq(jobs.id, liveId));
    expect(trashed!.deletedAt).toBeNull();
    expect(trashed!.slug).not.toBe(slug);
    expect(live!.slug).toBe(slug);
  });

  it("keeps the slug when nothing collides", async () => {
    const slug = `ops-${randomUUID().slice(0, 8)}`;
    const id = await insertJob(slug, new Date());
    const result = await restoreJob(id);
    expect(result).toMatchObject({ ok: true, slug, slugChanged: false });
    const rows = await db.select().from(jobs).where(and(eq(jobs.id, id)));
    expect(rows[0]!.deletedAt).toBeNull();
  });

  it("reports a missing or live job as not found", async () => {
    const id = await insertJob(`live-${randomUUID().slice(0, 8)}`, null);
    expect(await restoreJob(id)).toEqual({ ok: false, code: "jobNotFound" });
  });
});
