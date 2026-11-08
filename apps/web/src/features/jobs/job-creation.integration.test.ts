import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import { db, jobHiringTeam, jobStages, jobs, member, organization, user } from "@harly/db";
import { jobCreateSchema } from "@harly/validators";

/**
 * Brand-new instance, no integrations: one owner, one workspace, nothing else
 * configured (no workspace_settings, no AI, no email, no storage). A job with
 * only a title must be creatable, must get its default pipeline + hiring team,
 * must refuse to publish without readable content, and once published must be
 * visible on the public pages. Covers the dashboard server actions and the
 * REST v1 service against a REAL migrated Postgres (never mocks the DB).
 *
 *   RUN_JOB_CREATE_INTEGRATION=1 DATABASE_URL=... pnpm --filter web exec vitest run \
 *     src/features/jobs/job-creation.integration.test.ts
 */
const runJobCreateIntegration = process.env.RUN_JOB_CREATE_INTEGRATION === "1";

const ctx = vi.hoisted(() => ({ workspaceId: "", userId: "" }));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

// `redirect` throws NEXT_REDIRECT in Next; surface the target for assertions.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: ctx.workspaceId, name: "Fresh", slug: "fresh" },
    user: { id: ctx.userId, email: "owner@fresh.test", name: "Owner", image: null },
    membership: { id: "membership", role: "owner" },
    role: "owner",
    roleKey: "owner",
    session: {},
  })),
  getWorkspaceContextOrNull: vi.fn(async () => null),
}));

vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn(async () => undefined) }));

import { createJobAction, updateJobStatusAction } from "./actions";
import { getPublicJob } from "./data";
import { createJobForApi, serializeJob } from "./service";

async function redirectTarget(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("NEXT_REDIRECT:")) return message.slice("NEXT_REDIRECT:".length);
    throw error;
  }
  throw new Error("expected the action to redirect");
}

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe.skipIf(!runJobCreateIntegration)("job creation on a fresh instance (database)", () => {
  const tag = randomUUID().slice(0, 8);
  const workspaceId = `fresh-${tag}`;
  const userId = `fresh-user-${tag}`;

  beforeAll(async () => {
    ctx.workspaceId = workspaceId;
    ctx.userId = userId;
    await db.insert(organization).values({
      id: workspaceId,
      name: "Fresh workspace",
      slug: `fresh-${tag}`,
      createdAt: new Date(),
    });
    await db.insert(user).values({
      id: userId,
      name: "Owner",
      email: `owner-${tag}@fresh.test`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(member).values({
      id: `fresh-member-${tag}`,
      organizationId: workspaceId,
      userId,
      role: "owner",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, workspaceId));
    await db.delete(user).where(eq(user.id, userId));
  });

  it("dashboard: 'Save as draft' with ONLY a title creates a draft with pipeline and hiring team", async () => {
    const target = await redirectTarget(() =>
      createJobAction(form({ title: `Only title ${tag}`, intent: "draft" })),
    );
    const jobId = target.replace("/dashboard/jobs/", "");
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    expect(job.status).toBe("draft");
    expect(job.description).toBe("");
    expect(job.employmentType).toBe("full_time");
    expect(job.workplaceType).toBe("remote");
    expect(job.publishedAt).toBeNull();

    const stages = await db.select().from(jobStages).where(eq(jobStages.jobId, jobId));
    expect(stages.length).toBeGreaterThanOrEqual(3);
    expect(stages.map((s) => s.kind)).toEqual(
      expect.arrayContaining(["applied", "hired"]),
    );
    const team = await db.select().from(jobHiringTeam).where(eq(jobHiringTeam.jobId, jobId));
    expect(team.map((t) => t.userId)).toEqual([userId]);

    // A draft must NOT be public.
    expect(await getPublicJob(job.slug)).toBeNull();
  });

  it("dashboard: publishing with only a title is refused and creates nothing", async () => {
    const title = `Publish no content ${tag}`;
    await expect(
      createJobAction(form({ title, intent: "continue" })),
    ).rejects.toThrow(/description|section/i);
    const rows = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.workspaceId, workspaceId), eq(jobs.title, title)));
    expect(rows).toHaveLength(0);
  });

  it("dashboard: draft -> publish is blocked without a description, allowed with one, then public", async () => {
    const target = await redirectTarget(() =>
      createJobAction(form({ title: `Publishable ${tag}`, intent: "draft" })),
    );
    const jobId = target.replace("/dashboard/jobs/", "");

    await expect(
      updateJobStatusAction(form({ jobId, status: "open" })),
    ).rejects.toThrow(/description|section/i);
    const [stillDraft] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    expect(stillDraft.status).toBe("draft");

    await db
      .update(jobs)
      .set({ description: "<p>Build and ship the hiring product with us.</p>" })
      .where(eq(jobs.id, jobId));
    await updateJobStatusAction(form({ jobId, status: "open" })).catch((error) => {
      // The action may redirect/revalidate afterwards; only a redirect is fine.
      if (!String(error?.message).startsWith("NEXT_REDIRECT")) throw error;
    });

    const [published] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    expect(published.status).toBe("open");
    expect(published.publishedAt).toBeInstanceOf(Date);
    const publicJob = await getPublicJob(published.slug);
    expect(publicJob?.id).toBe(jobId);
    expect(publicJob?.title).toBe(`Publishable ${tag}`);
  });

  it("dashboard: creating directly with title + description and 'Publish' goes public", async () => {
    const target = await redirectTarget(() =>
      createJobAction(
        form({
          title: `Direct publish ${tag}`,
          description: "<p>A real description with enough words in it.</p>",
          intent: "continue",
        }),
      ),
    );
    expect(target).toMatch(/\?published=1$/);
    const jobId = target.replace("/dashboard/jobs/", "").replace("?published=1", "");
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    expect(job.status).toBe("open");
    expect((await getPublicJob(job.slug))?.id).toBe(jobId);
  });

  it("API v1: schema accepts a title-only body and defaults the rest", () => {
    const parsed = jobCreateSchema.parse({ title: "API only title" });
    expect(parsed.description).toBe("");
    expect(parsed.employmentType).toBe("full_time");
    expect(parsed.workplaceType).toBe("remote");
    // Publishing through the API still needs content.
    expect(
      jobCreateSchema.safeParse({ title: "x", status: "open" }).success,
    ).toBe(false);
  });

  it("API v1: createJobForApi with title only yields a draft with pipeline, team and no public page", async () => {
    const values = jobCreateSchema.parse({ title: `API draft ${tag}` });
    const job = await createJobForApi({ workspaceId, actorUserId: userId, values });
    const body = serializeJob(job);
    expect(body.status).toBe("draft");
    expect(body.publishedAt).toBeNull();

    const stages = await db.select().from(jobStages).where(eq(jobStages.jobId, job.id));
    expect(stages.length).toBeGreaterThanOrEqual(3);
    const team = await db.select().from(jobHiringTeam).where(eq(jobHiringTeam.jobId, job.id));
    expect(team.map((t) => t.userId)).toEqual([userId]);
    expect(await getPublicJob(job.slug)).toBeNull();
  });

  it("API v1: createJobForApi published with a description is public", async () => {
    const values = jobCreateSchema.parse({
      title: `API open ${tag}`,
      description: "Public description for the API job.",
      status: "open",
    });
    const job = await createJobForApi({ workspaceId, actorUserId: userId, values });
    expect(job.status).toBe("open");
    expect((await getPublicJob(job.slug))?.id).toBe(job.id);
  });
});
