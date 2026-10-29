import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db, mailThreads } from "@harly/db";

import {
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

import { getInboxData, getUnreadInboxThreadCount } from "./data";

describe.skipIf(!runPipelineIntegration)("mailbox: role scope (database)", () => {
  let fx: AuthorizationFixture;
  const threads: Record<string, string> = {};

  function actAs(key: ActorKey) {
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = fx.users[key];
    ctx.roleKey = fx.roleKeys[key];
  }

  async function addThread(
    name: string,
    values: { candidateId?: string | null; applicationId?: string | null; ownerId?: string | null },
  ) {
    const [row] = await db
      .insert(mailThreads)
      .values({
        workspaceId: fx.workspaceId,
        subject: `Thread ${name}`,
        normalizedSubject: `thread ${name.toLowerCase()}`,
        participantEmail: `${name.toLowerCase()}@example.test`,
        candidateId: values.candidateId ?? null,
        applicationId: values.applicationId ?? null,
        ownerId: values.ownerId ?? null,
        // Provider threads carry no mailbox row (see mail_threads_source_mailbox_check).
        source: "provider",
        unreadCount: 1,
      })
      .returning({ id: mailThreads.id });
    threads[name] = row.id;
  }

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    // Linked to candidateA, which has an application on in-scope job A.
    await addThread("CandidateA", { candidateId: fx.candidateA });
    // Linked to candidateB, whose only application is on job B (out of scope).
    await addThread("CandidateB", { candidateId: fx.candidateB });
    // Linked to candidateAB through the application on job A (in scope).
    await addThread("ABonA", { candidateId: fx.candidateAB, applicationId: fx.applicationAB.onA });
    // Linked to candidateAB through the application on job B (out of scope).
    await addThread("ABonB", { candidateId: fx.candidateAB, applicationId: fx.applicationAB.onB });
    // Unlinked, owned by the scoped user.
    await addThread("MineUnlinked", { ownerId: fx.users.scoped });
    // Unlinked, owned by the unrestricted user.
    await addThread("OtherUnlinked", { ownerId: fx.users.full });
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("lists only threads linked to in-scope candidates and applications, plus own unlinked threads", async () => {
    actAs("scoped");
    const data = await getInboxData({ filter: "all" });
    const ids = data.threads.map((thread) => thread.id);
    expect(ids).toEqual(
      expect.arrayContaining([threads.CandidateA, threads.ABonA, threads.MineUnlinked]),
    );
    expect(ids).not.toContain(threads.CandidateB);
    expect(ids).not.toContain(threads.ABonB);
    expect(ids).not.toContain(threads.OtherUnlinked);
    expect(ids).toHaveLength(3);
  });

  it("does not open an out-of-scope thread by id", async () => {
    actAs("scoped");
    for (const name of ["CandidateB", "ABonB", "OtherUnlinked"]) {
      const data = await getInboxData({ filter: "all", threadId: threads[name] });
      expect(data.threads.map((thread) => thread.id)).not.toContain(threads[name]);
      expect(data.messages[threads[name]]).toBeUndefined();
    }
  });

  it("offers only in-scope candidates and applications in the inbox pickers", async () => {
    actAs("scoped");
    const data = await getInboxData({ filter: "all" });
    const candidateIds = data.candidates.map((candidate) => candidate.id);
    expect(candidateIds).toEqual(expect.arrayContaining([fx.candidateA, fx.candidateAB]));
    expect(candidateIds).not.toContain(fx.candidateB);
    expect(data.applications.every((application) => application.jobId === fx.jobA)).toBe(true);
    expect(data.applications.map((application) => application.id)).not.toContain(fx.applicationAB.onB);
  });

  it("counts only unread threads the scoped caller can see", async () => {
    actAs("scoped");
    expect(await getUnreadInboxThreadCount()).toBe(3);
  });

  it("never lists threads from another workspace", async () => {
    const [row] = await db
      .insert(mailThreads)
      .values({
        workspaceId: fx.otherWorkspaceCandidate.workspaceId,
        subject: "Other workspace",
        normalizedSubject: "other workspace",
        participantEmail: "other@example.test",
        source: "provider",
        unreadCount: 1,
      })
      .returning({ id: mailThreads.id });
    actAs("full");
    const data = await getInboxData({ filter: "all" });
    expect(data.threads.map((thread) => thread.id)).not.toContain(row.id);
    expect(await getUnreadInboxThreadCount()).toBe(6);
  });

  it("keeps every thread, picker entry and unread count for an unrestricted caller", async () => {
    actAs("full");
    const data = await getInboxData({ filter: "all" });
    const ids = data.threads.map((thread) => thread.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        threads.CandidateA,
        threads.CandidateB,
        threads.ABonA,
        threads.ABonB,
        threads.MineUnlinked,
        threads.OtherUnlinked,
      ]),
    );
    expect(data.candidates.map((candidate) => candidate.id)).toEqual(
      expect.arrayContaining([fx.candidateA, fx.candidateB, fx.candidateAB]),
    );
    expect(data.applications.map((application) => application.id)).toEqual(
      expect.arrayContaining([fx.applicationAB.onA, fx.applicationAB.onB]),
    );
    expect(await getUnreadInboxThreadCount()).toBe(6);
  });
});
