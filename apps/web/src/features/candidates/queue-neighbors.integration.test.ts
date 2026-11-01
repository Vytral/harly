import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createAuthorizationFixture,
  RECRUITER_PERMISSIONS,
  type AuthorizationFixture,
} from "@/test-support/authorization-fixture";
import { runPipelineIntegration } from "@/test-support/pipeline-fixture";
import type { WorkspaceSearchActor } from "@/features/search/scope";
import { getReviewQueue } from "@/features/review/queue";

import {
  getCandidatePageNavigation,
  getDirectoryNeighbours,
  getPipelineNeighbours,
} from "./queue-neighbors";
import { pipelineOrigin, REVIEW_ORIGIN } from "./origin";

describe.skipIf(!runPipelineIntegration)("candidate pager neighbours (database)", () => {
  let fx: AuthorizationFixture;
  let scoped: WorkspaceSearchActor;
  let full: WorkspaceSearchActor;

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    scoped = {
      workspaceId: fx.workspaceId,
      userId: fx.users.scoped,
      permissions: RECRUITER_PERMISSIONS,
      scope: { jobAccess: "assigned", departments: [], regions: [] },
    };
    full = {
      workspaceId: fx.workspaceId,
      userId: fx.users.full,
      permissions: RECRUITER_PERMISSIONS,
      scope: { jobAccess: "all", departments: [], regions: [] },
    };
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("walks the directory inside a scoped caller's scope only", async () => {
    const at = await getDirectoryNeighbours(scoped, { sort: "name" }, fx.candidateA);
    expect(at.total).toBe(2);
    // Sorted by last name: "Candidate …" (A) before "Person …" (AB).
    expect(at.position).toBe(1);
    expect(at.prev).toBeNull();
    expect(at.next?.candidateId).toBe(fx.candidateAB);

    const outside = await getDirectoryNeighbours(scoped, { sort: "name" }, fx.candidateB);
    expect(outside.position).toBeNull();
    expect(outside.next?.candidateId).not.toBe(fx.candidateB);
  });

  it("applies directory filters to the walk", async () => {
    const at = await getDirectoryNeighbours(full, { q: "Zed" }, fx.candidateB);
    expect(at).toMatchObject({ position: 1, total: 1, prev: null, next: null });
  });

  it("walks a pipeline job only when the job is in scope", async () => {
    const inScope = await getPipelineNeighbours(scoped, pipelineOrigin({ jobId: fx.jobA }), {
      candidateId: fx.candidateA,
      applicationId: null,
    });
    expect(inScope.total).toBe(2);
    expect(inScope.position).not.toBeNull();

    const outOfScope = await getPipelineNeighbours(scoped, pipelineOrigin({ jobId: fx.jobB }), {
      candidateId: fx.candidateB,
      applicationId: null,
    });
    expect(outOfScope).toMatchObject({ position: null, total: 0, next: null });

    const stageFiltered = await getPipelineNeighbours(
      full,
      pipelineOrigin({ jobId: fx.jobA, stage: fx.stagesA.screening!.id }),
      { candidateId: fx.candidateA, applicationId: null },
    );
    expect(stageFiltered).toMatchObject({ position: 1, total: 1 });
  });

  it("follows the review queue with the same count the queue reports", async () => {
    const queue = await getReviewQueue(full);
    const head = queue.items[0];
    if (!head) return;
    const nav = await getCandidatePageNavigation(
      full,
      { origin: REVIEW_ORIGIN, applicationId: head.applicationId },
      head.candidateId,
    );
    expect(nav.total).toBe(queue.total);
    expect(nav.position).toBe(1);
    expect(nav.backHref).toBe("/dashboard/candidates?queue=review");
    if (queue.items[1]) {
      expect(nav.next?.href).toContain(`application=${queue.items[1].applicationId}`);
    }
  });
});
