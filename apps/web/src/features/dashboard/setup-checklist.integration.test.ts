import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db, invitation } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

const context = vi.hoisted(() => ({ workspaceId: "", userId: "" }));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: context.workspaceId },
    user: { id: context.userId },
    role: "owner",
  })),
}));

import { getSetupChecklist } from "./setup-checklist";

const DAY = 24 * 60 * 60 * 1000;

async function inviteTeammateDone(): Promise<boolean> {
  const checklist = await getSetupChecklist();
  const item = checklist.items.find((entry) => entry.key === "invite_teammate");
  if (!item) throw new Error("The invite teammate item is missing from the checklist.");
  return item.done;
}

async function addInvitation(input: {
  workspaceId: string;
  inviterId: string;
  status: string;
  expiresAt: Date;
}) {
  await db.insert(invitation).values({
    id: randomUUID(),
    organizationId: input.workspaceId,
    email: `invitee-${randomUUID()}@example.test`,
    role: "recruiter",
    status: input.status,
    expiresAt: input.expiresAt,
    inviterId: input.inviterId,
  });
}

describe.skipIf(!runPipelineIntegration)("setup checklist invitations (database)", () => {
  let fixture: PipelineFixture;

  beforeEach(async () => {
    fixture = await createPipelineFixture();
    context.workspaceId = fixture.workspaceId;
    context.userId = fixture.userId;
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("is not done when there are no invitations", async () => {
    expect(await inviteTeammateDone()).toBe(false);
  });

  it("is done for a pending invitation that has not expired", async () => {
    await addInvitation({
      workspaceId: fixture.workspaceId,
      inviterId: fixture.userId,
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * DAY),
    });
    expect(await inviteTeammateDone()).toBe(true);
  });

  it("ignores a pending invitation that has expired", async () => {
    await addInvitation({
      workspaceId: fixture.workspaceId,
      inviterId: fixture.userId,
      status: "pending",
      expiresAt: new Date(Date.now() - DAY),
    });
    expect(await inviteTeammateDone()).toBe(false);
  });

  it("ignores invitations that were accepted, canceled or rejected", async () => {
    for (const status of ["accepted", "canceled", "rejected"]) {
      await addInvitation({
        workspaceId: fixture.workspaceId,
        inviterId: fixture.userId,
        status,
        expiresAt: new Date(Date.now() + 7 * DAY),
      });
    }
    expect(await inviteTeammateDone()).toBe(false);
  });
});
