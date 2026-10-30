import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import { db, jobStages } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

const session = vi.hoisted(() => ({ workspaceId: "" }));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: session.workspaceId, name: "Fixture" },
    user: { id: "unused", name: "Fixture", email: "fixture@example.test" },
  })),
}));

import { getApplicationsBoard } from "@/features/dashboard/applications-board";

describe.skipIf(!runPipelineIntegration)("dashboard applications board stages", () => {
  let fixture: PipelineFixture;
  let screeningAppId: string;
  let legacyAppId: string;
  let customAppId: string;

  beforeAll(async () => {
    fixture = await createPipelineFixture();
    session.workspaceId = fixture.workspaceId;

    const screening = fixture.stages.screening!;
    const interview = fixture.stages.interview!;
    const offer = fixture.stages.offer!;

    // A renamed stage keeps its kind; the filter must follow the kind.
    await db
      .update(jobStages)
      .set({ name: "Phone screen" })
      .where(eq(jobStages.id, screening.id));

    // A pre-0.3.0 row with no kind is classified by its legacy name.
    await db
      .update(jobStages)
      .set({ kind: null })
      .where(eq(jobStages.id, interview.id));

    // A custom stage is its own filter, by name.
    const [panel] = await db
      .insert(jobStages)
      .values({
        workspaceId: fixture.workspaceId,
        jobId: fixture.jobId,
        name: "Panel review",
        color: "#EEEEEE",
        kind: "custom",
        order: 10,
      })
      .returning({ id: jobStages.id });

    // Archived stages keep their history but leave the filter options.
    await db
      .update(jobStages)
      .set({ archivedAt: new Date() })
      .where(and(eq(jobStages.id, offer.id), eq(jobStages.workspaceId, fixture.workspaceId)));

    screeningAppId = (await fixture.addApplication({ stageId: screening.id })).applicationId;
    legacyAppId = (await fixture.addApplication({ stageId: interview.id })).applicationId;
    customAppId = (await fixture.addApplication({ stageId: panel.id })).applicationId;
  });

  afterAll(async () => {
    await fixture?.cleanup();
  });

  it("reports each application's stage kind, classifying NULL-kind rows by name", async () => {
    const board = await getApplicationsBoard({ jobId: fixture.jobId });
    const byId = new Map(board.applications.map((row) => [row.applicationId, row]));

    expect(byId.get(screeningAppId)).toMatchObject({ stageName: "Phone screen", stageKind: "screening" });
    expect(byId.get(legacyAppId)).toMatchObject({ stageName: "Interview", stageKind: "interview" });
    expect(byId.get(customAppId)).toMatchObject({ stageName: "Panel review", stageKind: "custom" });
  });

  it("offers stage kinds and custom names, and leaves archived stages out", async () => {
    const board = await getApplicationsBoard();
    const values = board.stageOptions.map((option) => option.value);

    expect(values).toContain("screening");
    expect(values).toContain("interview");
    expect(values).toContain("Panel review");
    expect(values).not.toContain("offer");
    expect(values).not.toContain("custom");

    const screeningOption = board.stageOptions.find((option) => option.value === "screening");
    expect(screeningOption?.label).toBe("Phone screen");
  });

  it("filters by kind even after a rename", async () => {
    const board = await getApplicationsBoard({ jobId: fixture.jobId, stage: "screening" });

    expect(board.applications.map((row) => row.applicationId)).toEqual([screeningAppId]);
  });

  it("still honours a display-name filter from an older URL", async () => {
    const board = await getApplicationsBoard({ jobId: fixture.jobId, stage: "Panel review" });

    expect(board.applications.map((row) => row.applicationId)).toEqual([customAppId]);
  });

  it("matches a NULL-kind stage by its kind", async () => {
    const board = await getApplicationsBoard({ jobId: fixture.jobId, stage: "interview" });

    expect(board.applications.map((row) => row.applicationId)).toEqual([legacyAppId]);
  });
});
