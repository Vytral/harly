import { randomUUID } from "node:crypto";
import { ApiError } from "@harly/api";
import {
  createDatabaseClient,
  organization,
  user,
  workflowDrafts,
} from "@harly/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WorkflowGraphV2 } from "./schema-v2";
import { createWorkflowWithDraft, saveWorkflowDraft } from "./service";

const databaseUrl = process.env.AUTOMATIONS_TEST_DATABASE_URL;
if (
  databaseUrl &&
  (!new URL(databaseUrl).pathname.startsWith("/harly_automations_verify_") ||
    !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname))
) {
  throw new Error("Use an isolated local automations verification database");
}

const firstClient = databaseUrl ? createDatabaseClient(databaseUrl) : null;
const secondClient = databaseUrl ? createDatabaseClient(databaseUrl) : null;

describe.skipIf(!databaseUrl)("T04 — draft CAS conflict", () => {
  const workspaceId = `cas-test-${randomUUID()}`;
  const actorId = `cas-user-${randomUUID()}`;
  const testState: { workflowId: string; draftRevision: number } = {
    workflowId: "",
    draftRevision: 1,
  };
  let fixtureCreated = false;

  beforeAll(async () => {
    await firstClient!.db.insert(organization).values({
      id: workspaceId,
      name: "Automation CAS test",
      slug: workspaceId,
      createdAt: new Date(),
    });
    fixtureCreated = true;
    await firstClient!.db.insert(user).values({
      id: actorId,
      name: "Automation CAS test user",
      email: `${actorId}@example.test`,
    });

    const workflow = await createWorkflowWithDraft({
      workspaceId,
      createdById: actorId,
      values: {
        name: "Concurrent draft save",
        enabled: false,
        trigger: { event: "application.created", filter: {} },
        conditions: [],
        actions: [],
      },
      graph: graph("Original"),
      database: firstClient!.db,
    });
    testState.workflowId = workflow.id;
    testState.draftRevision = workflow.draftRevision;
  });

  afterAll(async () => {
    try {
      if (fixtureCreated) {
        await firstClient!.db
          .delete(organization)
          .where(eq(organization.id, workspaceId));
        await firstClient!.db.delete(user).where(eq(user.id, actorId));
      }
    } finally {
      await Promise.all([firstClient?.sql.end(), secondClient?.sql.end()]);
    }
  });

  it("allows exactly one of two clients to save the same expected revision", async () => {
    const expectedRevision = testState.draftRevision;
    const writes = await Promise.allSettled([
      saveWorkflowDraft({
        workspaceId,
        id: testState.workflowId,
        expectedRevision,
        patch: {},
        graph: graph("Editor A"),
        database: firstClient!.db,
      }),
      saveWorkflowDraft({
        workspaceId,
        id: testState.workflowId,
        expectedRevision,
        patch: {},
        graph: graph("Editor B"),
        database: secondClient!.db,
      }),
    ]);

    const winners = writes.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof saveWorkflowDraft>>
      > => result.status === "fulfilled",
    );
    const conflicts = writes.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(winners).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.reason).toBeInstanceOf(ApiError);
    expect(conflicts[0]!.reason).toMatchObject({
      code: "conflict",
      status: 409,
    });

    const winningName = triggerName(winners[0]!.value.graph);
    expect(["Editor A", "Editor B"]).toContain(winningName);
    const [persisted] = await firstClient!.db
      .select({
        revision: workflowDrafts.revision,
        graph: workflowDrafts.graph,
      })
      .from(workflowDrafts)
      .where(eq(workflowDrafts.workflowId, testState.workflowId));
    expect(persisted?.revision).toBe(expectedRevision + 1);
    expect(persisted?.graph).toEqual(winners[0]!.value.graph);
    expect(triggerName(persisted?.graph)).toBe(winningName);
  });
});

function graph(name: string): WorkflowGraphV2 {
  return {
    schemaVersion: 2,
    entryNodeId: "trigger",
    nodes: [
      {
        id: "trigger",
        type: "trigger",
        event: "application.created",
        filter: {},
        name,
      },
      { id: "end", type: "end", result: "completed" },
    ],
    edges: [{ id: "finish", source: "trigger", port: "next", target: "end" }],
  };
}

function triggerName(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || !("nodes" in value))
    return undefined;
  const nodes = value.nodes;
  if (!Array.isArray(nodes)) return undefined;
  const trigger = nodes.find(
    (node): node is { type: string; name?: string } =>
      !!node &&
      typeof node === "object" &&
      "type" in node &&
      node.type === "trigger",
  );
  return trigger?.name;
}
