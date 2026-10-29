import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db, emailOutbox } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

const mocks = vi.hoisted(() => ({
  sendWorkspaceEmail: vi.fn(),
}));

vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return { ...actual, sendWorkspaceEmail: mocks.sendWorkspaceEmail };
});

import { sendPipelineEmails } from "@/features/pipeline/emails";

import { processEmailOutbox, SAMPLE_RECIPIENT_NOTE } from "./outbox-processor";

async function readRow(id: string) {
  const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id)).limit(1);
  return row;
}

describe.skipIf(!runPipelineIntegration)("sample recipients never reach the provider", () => {
  let fx: PipelineFixture;

  beforeAll(async () => {
    fx = await createPipelineFixture();
  });
  afterAll(async () => {
    await fx?.cleanup();
  });
  beforeEach(() => {
    mocks.sendWorkspaceEmail.mockReset();
    mocks.sendWorkspaceEmail.mockResolvedValue({ messageId: "should-not-happen" });
  });

  it("a pipeline move of a sample candidate makes no provider call and leaves no failure noise", async () => {
    const summary = await sendPipelineEmails(fx.workspaceId, [
      {
        type: "stage",
        applicationId: "00000000-0000-4000-8000-000000000001",
        candidateEmail: "ada.lovelace@sample.invalid",
        candidateName: "Ada Lovelace",
        jobTitle: "Sample · Senior Product Engineer",
        stageName: "Interview",
        workspaceName: "Fixture",
      },
    ]);

    expect(mocks.sendWorkspaceEmail).not.toHaveBeenCalled();
    expect(summary).toEqual({ queued: 1, sent: 0, failed: 0, emailWarning: undefined });

    const [row] = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.workspaceId, fx.workspaceId));
    expect(row).toMatchObject({ status: "cancelled", attempts: 1, lastError: SAMPLE_RECIPIENT_NOTE });
    expect(row.nextRetryAt).toBeNull();
  });

  it("never retries a skipped sample row, even when it is requested by id", async () => {
    const [inserted] = await db
      .insert(emailOutbox)
      .values({
        workspaceId: fx.workspaceId,
        kind: "pipeline.rejected",
        payload: { candidateEmail: "dana@sample.invalid", candidateName: "Dana" },
        dedupeKey: `sample-${crypto.randomUUID()}`,
      })
      .returning({ id: emailOutbox.id });

    await processEmailOutbox({ ids: [inserted.id], workspaceId: fx.workspaceId });
    const again = await processEmailOutbox({ ids: [inserted.id], workspaceId: fx.workspaceId });

    expect(again.processed).toBe(0);
    expect(mocks.sendWorkspaceEmail).not.toHaveBeenCalled();
    expect(await readRow(inserted.id)).toMatchObject({ status: "cancelled" });
  });

  it("still delivers to a real recipient in the same batch", async () => {
    const [sample] = await db
      .insert(emailOutbox)
      .values({
        workspaceId: fx.workspaceId,
        kind: "automation.email",
        payload: { to: "someone@sample.invalid", subject: "Hi", bodyHtml: "<p>Hi</p>" },
        dedupeKey: `sample-${crypto.randomUUID()}`,
      })
      .returning({ id: emailOutbox.id });

    const result = await processEmailOutbox({ ids: [sample.id], workspaceId: fx.workspaceId });

    expect(result).toMatchObject({ processed: 1, skipped: 1, failed: 0, sent: 0 });
    expect(mocks.sendWorkspaceEmail).not.toHaveBeenCalled();
  });
});
