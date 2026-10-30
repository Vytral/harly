import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, emailOutbox } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import { enqueueEmailOutbox } from "./outbox-processor";

async function readRow(id: string) {
  const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id)).limit(1);
  return row;
}

const PAYLOAD = { candidateEmail: "casey@example.test", stageName: "Interview" };

describe.skipIf(!runPipelineIntegration)("email outbox enqueue keys", () => {
  let fx: PipelineFixture;

  beforeAll(async () => {
    fx = await createPipelineFixture();
  });
  afterAll(async () => {
    await fx?.cleanup();
  });

  it("dedupes a true retry of the same durable event onto one row", async () => {
    const first = await enqueueEmailOutbox(fx.workspaceId, "pipeline.stage", PAYLOAD, "history-retry-1");
    const retry = await enqueueEmailOutbox(fx.workspaceId, "pipeline.stage", PAYLOAD, "history-retry-1");

    expect(retry).toBe(first);
  });

  it("creates a second row for a new event with an identical payload", async () => {
    const first = await enqueueEmailOutbox(fx.workspaceId, "pipeline.stage", PAYLOAD, "history-move-1");
    const second = await enqueueEmailOutbox(fx.workspaceId, "pipeline.stage", PAYLOAD, "history-move-2");

    expect(second).not.toBe(first);
  });

  it("resets a terminally failed row when an explicit user send conflicts with it", async () => {
    const key = "offer-send-terminal-1";
    const id = await enqueueEmailOutbox(fx.workspaceId, "offer.extended", PAYLOAD, key);
    await db
      .update(emailOutbox)
      .set({
        status: "failed",
        attempts: 5,
        nextRetryAt: null,
        lastError: "Email provider did not accept the offer.",
      })
      .where(eq(emailOutbox.id, id));

    const again = await enqueueEmailOutbox(fx.workspaceId, "offer.extended", PAYLOAD, key, undefined, db, {
      resetTerminal: true,
    });

    expect(again).toBe(id);
    expect(await readRow(id)).toMatchObject({
      status: "pending",
      attempts: 0,
      lastError: null,
      lockedBy: null,
    });
  });

  it("never resets a row whose outcome is unknown, since it may already have been delivered", async () => {
    const key = "offer-send-unknown-1";
    const id = await enqueueEmailOutbox(fx.workspaceId, "offer.extended", PAYLOAD, key);
    await db
      .update(emailOutbox)
      .set({
        status: "failed",
        attempts: 1,
        lastError: "Delivery outcome unknown: the mail server stopped responding after the message was handed over.",
      })
      .where(eq(emailOutbox.id, id));

    const again = await enqueueEmailOutbox(fx.workspaceId, "offer.extended", PAYLOAD, key, undefined, db, {
      resetTerminal: true,
    });

    expect(again).toBe(id);
    expect(await readRow(id)).toMatchObject({ status: "failed", attempts: 1 });
  });

  it("resets a cancelled row for an explicit user send, but leaves a sent row alone", async () => {
    const cancelledKey = "offer-send-cancelled-1";
    const cancelled = await enqueueEmailOutbox(fx.workspaceId, "offer.extended", PAYLOAD, cancelledKey);
    await db.update(emailOutbox).set({ status: "cancelled" }).where(eq(emailOutbox.id, cancelled));
    const reset = await enqueueEmailOutbox(fx.workspaceId, "offer.extended", PAYLOAD, cancelledKey, undefined, db, {
      resetTerminal: true,
    });
    expect(reset).toBe(cancelled);
    expect((await readRow(cancelled)).status).toBe("pending");

    const sentKey = "offer-send-sent-1";
    const sent = await enqueueEmailOutbox(fx.workspaceId, "offer.extended", PAYLOAD, sentKey);
    await db
      .update(emailOutbox)
      .set({ status: "sent", sentAt: new Date(), providerMessageId: "provider-sent-1" })
      .where(eq(emailOutbox.id, sent));
    const again = await enqueueEmailOutbox(fx.workspaceId, "offer.extended", PAYLOAD, sentKey, undefined, db, {
      resetTerminal: true,
    });
    expect(again).toBe(sent);
    expect(await readRow(sent)).toMatchObject({ status: "sent", providerMessageId: "provider-sent-1" });
  });
});
