import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import {
  automationAiProposals,
  createDatabaseClient,
  organization,
  user as authUser,
  workflowDefinitions,
} from "@harly/db";

import {
  applyAutomationProposal,
  createAutomationProposalPreviewToken,
  getAutomationProposal,
  prepareAutomationProposal,
  simulateAutomationProposal,
} from "./ai-proposals";
import { legacyToGraph } from "./definition/legacy-adapter";
import { getWorkflow, updateWorkflow } from "./data";
import { reconcileOrphanApplyingProposals } from "./run-repair";

// This suite exercises the real persistence and optimistic-concurrency
// boundary. Session/header resolution belongs to the authorization suite and
// cannot run outside a Next request scope, so keep only that edge mocked here.
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

describe.skipIf(!url)("automation AI proposals", () => {
  const client = url ? createDatabaseClient(url) : null;
  const workspaceId = `ai-proposal-${randomUUID()}`;
  const actorId = `ai-proposal-user-${randomUUID()}`;
  const graph = legacyToGraph({
    trigger: { event: "application.created" },
    conditions: [],
    actions: [{ type: "add_tag", config: { label: "ai-proposed" } }],
  });

  beforeAll(async () => {
    await client!.db.insert(organization).values({
      id: workspaceId,
      name: "AI proposal test",
      slug: workspaceId,
      createdAt: new Date(),
    });
    await client!.db.insert(authUser).values({
      id: actorId,
      name: "AI proposal actor",
      email: `${actorId}@example.test`,
    });
  });

  afterAll(async () => {
    await client!.db.delete(organization).where(eq(organization.id, workspaceId));
    await client!.db.delete(authUser).where(eq(authUser.id, actorId));
    await client!.sql.end();
  });

  it("prepares, simulates, applies, and replays a new draft without publishing", async () => {
    const proposal = await prepareAutomationProposal({
      workspaceId,
      actorId,
      name: "Tag new applicants",
      graph,
    });
    expect(proposal.status).toBe("prepared");
    expect(proposal.issues).toEqual([]);
    expect(proposal.diff).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "metadata_changed", id: "name", after: "Tag new applicants" }),
      expect.objectContaining({ kind: "node_added", id: "action_0" }),
    ]));

    const simulation = await simulateAutomationProposal({
      workspaceId,
      actorId,
      proposalId: proposal.id,
      trigger: { candidate: { id: "sample-candidate" } },
    });
    const previewToken = createAutomationProposalPreviewToken({
      proposalId: proposal.id,
      graphHash: simulation.graphHash,
    });
    expect(["verified", "partial"]).toContain(simulation.status);
    expect(simulation.coveragePercent).toBeGreaterThan(0);

    const actionId = randomUUID();
    const applied = await applyAutomationProposal({
      workspaceId,
      actorId,
      proposalId: proposal.id,
      actionId,
      previewToken,
    });
    expect(applied.replayed).toBe(false);
    const workflow = await getWorkflow({ workspaceId, id: applied.workflowId });
    expect(workflow.status).toBe("draft");
    expect(workflow.graph).toEqual(graph);

    const replay = await applyAutomationProposal({
      workspaceId,
      actorId,
      proposalId: proposal.id,
      actionId,
      previewToken,
    });
    expect(replay).toMatchObject({
      workflowId: applied.workflowId,
      draftRevision: applied.draftRevision,
      replayed: true,
    });
  });

  it("moves a live workflow back to review when an operational limit is relaxed", async () => {
    const [definition] = await client!.db
      .select()
      .from(workflowDefinitions)
      .where(
        and(
          eq(workflowDefinitions.workspaceId, workspaceId),
          eq(workflowDefinitions.name, "Tag new applicants"),
        ),
      )
      .limit(1);
    expect(definition).toBeDefined();
    await client!.db
      .update(workflowDefinitions)
      .set({
        status: "published",
        enabled: true,
        maxExternalActionsPerMinute: 1,
      })
      .where(eq(workflowDefinitions.id, definition!.id));
    const current = await getWorkflow({ workspaceId, id: definition!.id });
    const updated = await updateWorkflow({
      workspaceId,
      id: current.id,
      expectedRevision: current.draftRevision,
      actorId,
      patch: { maxExternalActionsPerMinute: 2 },
    });
    expect(updated).toMatchObject({
      status: "draft",
      enabled: false,
      maxExternalActionsPerMinute: 2,
      operationalPolicyRelaxed: true,
    });
  });

  it("reconciles an applying proposal after the draft save succeeded", async () => {
    const [definition] = await client!.db
      .select()
      .from(workflowDefinitions)
      .where(
        and(
          eq(workflowDefinitions.workspaceId, workspaceId),
          eq(workflowDefinitions.name, "Tag new applicants"),
        ),
      )
      .limit(1);
    expect(definition).toBeDefined();
    const workflow = await getWorkflow({ workspaceId, id: definition!.id });
    const proposal = await prepareAutomationProposal({
      workspaceId,
      actorId,
      workflowId: workflow.id,
      expectedRevision: workflow.draftRevision,
      expectedContentHash: workflow.contentHash,
      name: workflow.name,
      graph: workflow.graph,
    });

    await updateWorkflow({
      workspaceId,
      id: workflow.id,
      expectedRevision: workflow.draftRevision,
      actorId,
      graph: workflow.graph,
      patch: { name: "Tag new applicants" },
    });
    await client!.db
      .update(automationAiProposals)
      .set({
        status: "applying",
        applyActionId: randomUUID(),
        updatedAt: new Date(Date.now() - 10 * 60 * 1000),
      })
      .where(eq(automationAiProposals.id, proposal.id));

    expect(await reconcileOrphanApplyingProposals(5)).toBe(1);
    await expect(
      getAutomationProposal({ workspaceId, actorId, proposalId: proposal.id }),
    ).resolves.toMatchObject({
      status: "applied",
      workflowId: workflow.id,
      appliedRevision: workflow.draftRevision + 1,
    });
  });

  it("opens a live circuit immediately without treating it as a relaxation", async () => {
    const [definition] = await client!.db
      .select({ id: workflowDefinitions.id })
      .from(workflowDefinitions)
      .where(
        and(
          eq(workflowDefinitions.workspaceId, workspaceId),
          eq(workflowDefinitions.name, "Tag new applicants"),
        ),
      )
      .limit(1);
    expect(definition).toBeDefined();
    await client!.db
      .update(workflowDefinitions)
      .set({ status: "published", enabled: true, circuitOpenUntil: null })
      .where(eq(workflowDefinitions.id, definition!.id));
    const current = await getWorkflow({ workspaceId, id: definition!.id });
    const circuitOpenUntil = new Date(Date.now() + 60_000).toISOString();
    const updated = await updateWorkflow({
      workspaceId,
      id: current.id,
      expectedRevision: current.draftRevision,
      actorId,
      patch: { circuitOpenUntil },
    });
    expect(updated).toMatchObject({
      status: "published",
      enabled: true,
      operationalPolicyRelaxed: false,
    });
    expect(updated.circuitOpenUntil?.getTime()).toBeGreaterThan(Date.now());

    const shortened = await updateWorkflow({
      workspaceId,
      id: updated.id,
      expectedRevision: updated.draftRevision,
      actorId,
      patch: { circuitOpenUntil: new Date(Date.now() + 30_000).toISOString() },
    });
    expect(shortened).toMatchObject({
      status: "draft",
      enabled: false,
      operationalPolicyRelaxed: true,
    });
  });

  it("rejects a proposal when its base draft revision has changed", async () => {
    const [definition] = await client!.db
      .select({ id: workflowDefinitions.id })
      .from(workflowDefinitions)
      .where(
        and(
          eq(workflowDefinitions.workspaceId, workspaceId),
          eq(workflowDefinitions.name, "Tag new applicants"),
        ),
      )
      .limit(1);
    expect(definition).toBeDefined();
    const workflow = await getWorkflow({ workspaceId, id: definition!.id });
    const proposal = await prepareAutomationProposal({
      workspaceId,
      actorId,
      workflowId: workflow.id,
      expectedRevision: workflow.draftRevision,
      expectedContentHash: workflow.contentHash,
      name: workflow.name,
      graph: workflow.graph,
    });
    const simulation = await simulateAutomationProposal({
      workspaceId,
      actorId,
      proposalId: proposal.id,
      trigger: { candidate: { id: "sample-candidate" } },
    });
    const previewToken = createAutomationProposalPreviewToken({
      proposalId: proposal.id,
      graphHash: simulation.graphHash,
    });
    await updateWorkflow({
      workspaceId,
      id: workflow.id,
      expectedRevision: workflow.draftRevision,
      actorId,
      graph: workflow.graph,
      patch: { name: "Edited while AI was thinking" },
    });

    await expect(
      applyAutomationProposal({
        workspaceId,
        actorId,
        proposalId: proposal.id,
        actionId: randomUUID(),
        previewToken,
      }),
    ).rejects.toThrow();
    expect(
      await getAutomationProposal({ workspaceId, actorId, proposalId: proposal.id }),
    ).toMatchObject({ status: "applying" });
  });
});
