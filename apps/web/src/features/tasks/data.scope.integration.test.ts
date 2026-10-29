import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db, tasks } from "@harly/db";

import {
  createAuthorizationFixture,
  type ActorKey,
  type AuthorizationFixture,
} from "@/test-support/authorization-fixture";
import { runPipelineIntegration } from "@/test-support/pipeline-fixture";

const ctx = vi.hoisted(() => ({ workspaceId: "", userId: "", roleKey: "owner" }));

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

import { getTask, getTaskCounts, listTaskContextOptions, listTasks } from "./data";

describe.skipIf(!runPipelineIntegration)("tasks: role scope (database)", () => {
  let fx: AuthorizationFixture;
  let inScopeTask: string;
  let outOfScopeTask: string;

  function actAs(key: ActorKey) {
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = fx.users[key];
    ctx.roleKey = fx.roleKeys[key];
  }

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    const base = { workspaceId: fx.workspaceId, ownerId: fx.users.full, createdById: fx.users.full };
    const [a, b] = await db
      .insert(tasks)
      .values([
        { ...base, title: "In scope", jobId: fx.jobA },
        { ...base, title: "Out of scope", jobId: fx.jobB },
      ])
      .returning({ id: tasks.id });
    inScopeTask = a.id;
    outOfScopeTask = b.id;
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("lists and counts only tasks inside a scoped caller's scope", async () => {
    actAs("scoped");
    const titles = (await listTasks()).map((task) => task.title);
    expect(titles).toContain("In scope");
    expect(titles).not.toContain("Out of scope");
    const counts = await getTaskCounts();
    expect(counts.pending).toBe(1);
  });

  it("does not open an out-of-scope task by id", async () => {
    actAs("scoped");
    expect(await getTask(outOfScopeTask)).toBeNull();
    expect((await getTask(inScopeTask))?.title).toBe("In scope");
  });

  it("offers only in-scope records in the task form", async () => {
    actAs("scoped");
    const options = await listTaskContextOptions();
    const jobIds = options.jobs.map((job) => job.id);
    expect(jobIds).toContain(fx.jobA);
    expect(jobIds).not.toContain(fx.jobB);
    expect(options.candidates.map((c) => c.id)).not.toContain(fx.candidateB);
  });

  it("keeps every task visible to an unrestricted caller", async () => {
    actAs("full");
    const titles = (await listTasks()).map((task) => task.title);
    expect(titles).toEqual(expect.arrayContaining(["In scope", "Out of scope"]));
    expect((await getTaskCounts()).pending).toBe(2);
  });
});
