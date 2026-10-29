import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, workspaceSettings } from "@harly/db";

import { createPipelineFixture, runPipelineIntegration, type PipelineFixture } from "@/test-support/pipeline-fixture";

describe.skipIf(!runPipelineIntegration)("workspace Gravatar setting (DB)", () => {
  let fixture: PipelineFixture;

  beforeAll(async () => {
    fixture = await createPipelineFixture();
  });

  afterAll(async () => {
    await fixture?.cleanup();
  });

  it("is off for an existing workspace that never saved the setting", async () => {
    const { getWorkspaceGravatarEnabled } = await import("./gravatar");
    await expect(getWorkspaceGravatarEnabled(fixture.workspaceId)).resolves.toBe(false);
  });

  it("reads the stored value once an admin turns it on", async () => {
    await db
      .insert(workspaceSettings)
      .values({ organizationId: fixture.workspaceId, gravatarEnabled: true })
      .onConflictDoUpdate({
        target: workspaceSettings.organizationId,
        set: { gravatarEnabled: true },
      });
    const { getWorkspaceGravatarEnabled } = await import("./gravatar");
    await expect(getWorkspaceGravatarEnabled(fixture.workspaceId)).resolves.toBe(true);
  });
});
