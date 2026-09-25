import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import {
  createDatabaseClient,
  organization,
  user as authUser,
} from "@harly/db";

import { prepareAutomationProposal } from "./ai-proposals";
import {
  enqueueAutomationAiJob,
  getAutomationAiJob,
  processAutomationAiJobs,
} from "./ai-jobs";
import { legacyToGraph } from "./definition/legacy-adapter";

vi.mock("@/features/workspaces/permissions-server", () => ({
  requireActorPermission: vi.fn(async () => undefined),
}));

const url = process.env.AUTOMATIONS_TEST_DATABASE_URL;
if (
  url &&
  (!new URL(url).pathname.startsWith("/harly_automations_verify_") ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
) {
  throw new Error("Use an isolated local automations verification database");
}

describe.skipIf(!url)("durable automation AI jobs", () => {
  const client = url ? createDatabaseClient(url) : null;
  const workspaceId = `ai-job-${randomUUID()}`;
  const actorId = `ai-job-user-${randomUUID()}`;

  beforeAll(async () => {
    await client!.db.insert(organization).values({
      id: workspaceId,
      name: "AI job test",
      slug: workspaceId,
      createdAt: new Date(),
    });
    await client!.db.insert(authUser).values({
      id: actorId,
      name: "AI job actor",
      email: `${actorId}@example.test`,
    });
  });

  afterAll(async () => {
    await client!.db.delete(organization).where(eq(organization.id, workspaceId));
    await client!.db.delete(authUser).where(eq(authUser.id, actorId));
    await client!.sql.end();
  });

  it("processes a queued simulation outside the HTTP request and is idempotent", async () => {
    const proposal = await prepareAutomationProposal({
      workspaceId,
      actorId,
      name: "Durable simulation",
      graph: legacyToGraph({
        trigger: { event: "application.created" },
        conditions: [],
        actions: [{ type: "add_tag", config: { label: "durable" } }],
      }),
    });
    const first = await enqueueAutomationAiJob({
      workspaceId,
      actorId,
      kind: "proposal_simulation",
      payload: {
        proposalId: proposal.id,
        trigger: { candidate: { id: "candidate-1" } },
      },
      idempotencyKey: `simulation:${proposal.id}`,
    });
    const same = await enqueueAutomationAiJob({
      workspaceId,
      actorId,
      kind: "proposal_simulation",
      payload: {
        proposalId: proposal.id,
        trigger: { candidate: { id: "candidate-1" } },
      },
      idempotencyKey: `simulation:${proposal.id}`,
    });
    expect(same.id).toBe(first.id);
    expect(first.status).toBe("queued");

    await expect(processAutomationAiJobs({ workerId: "integration-worker", limit: 1 })).resolves.toMatchObject({
      processed: 1,
      succeeded: 1,
      failed: 0,
    });
    await expect(
      getAutomationAiJob({ workspaceId, actorId, jobId: first.id }),
    ).resolves.toMatchObject({ status: "succeeded", result: expect.any(Object) });
  });
});

