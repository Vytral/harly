import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, emailOutbox } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import { processEmailOutbox } from "./outbox-processor";

// Real SQL for claim, reclaim and the attempt cap. The payloads deliberately
// fail before any provider call (no candidate email), so these tests exercise
// only the outbox bookkeeping.

async function insertRow(
  workspaceId: string,
  overrides: Partial<typeof emailOutbox.$inferInsert> = {},
) {
  const [row] = await db
    .insert(emailOutbox)
    .values({
      workspaceId,
      kind: "pipeline.stage",
      payload: { jobTitle: "Engineer", stageName: "Interview" },
      dedupeKey: `test-${crypto.randomUUID()}`,
      ...overrides,
    })
    .returning({ id: emailOutbox.id });
  return row.id;
}

async function readRow(id: string) {
  const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id)).limit(1);
  return row;
}

async function makeDue(id: string) {
  await db
    .update(emailOutbox)
    .set({ nextRetryAt: new Date(Date.now() - 1_000) })
    .where(eq(emailOutbox.id, id));
}

describe.skipIf(!runPipelineIntegration)("email outbox claim accounting", () => {
  let fx: PipelineFixture;

  beforeAll(async () => {
    fx = await createPipelineFixture();
  });
  afterAll(async () => {
    await fx?.cleanup();
  });

  it("counts every claim, so a failing row walks up to the cap and ends failed", async () => {
    const id = await insertRow(fx.workspaceId);

    await processEmailOutbox({ ids: [id], workspaceId: fx.workspaceId });
    let row = await readRow(id);
    expect(row).toMatchObject({ attempts: 1, status: "pending" });
    expect(row.nextRetryAt).not.toBeNull();
    expect(row.lastError).toMatch(/candidate/i);

    for (let attempt = 2; attempt <= 5; attempt += 1) {
      await makeDue(id);
      await processEmailOutbox({ ids: [id], workspaceId: fx.workspaceId });
      row = await readRow(id);
      expect(row.attempts).toBe(attempt);
    }
    expect(row).toMatchObject({ status: "failed", nextRetryAt: null });
    expect(row.lastError).toMatch(/candidate/i);

    await makeDue(id);
    await processEmailOutbox({ ids: [id], workspaceId: fx.workspaceId });
    expect((await readRow(id)).attempts).toBe(5);
  });

  it("reclaims a stalled lock while attempts remain, and counts the reclaim", async () => {
    const id = await insertRow(fx.workspaceId, {
      status: "processing",
      attempts: 1,
      lockedAt: new Date(Date.now() - 10 * 60_000),
      lockedBy: "dead-worker",
    });

    await processEmailOutbox({ ids: [id], workspaceId: fx.workspaceId });

    const row = await readRow(id);
    expect(row.attempts).toBe(2);
    expect(row.lockedBy).toBeNull();
    expect(row.status).toBe("pending");
  });

  it("ends a poison row that stalled after the last attempt as failed with an error, instead of looping", async () => {
    const id = await insertRow(fx.workspaceId, {
      status: "processing",
      attempts: 5,
      lockedAt: new Date(Date.now() - 10 * 60_000),
      lockedBy: "dead-worker",
    });

    const result = await processEmailOutbox({ ids: [id], workspaceId: fx.workspaceId });

    expect(result.processed).toBe(0);
    const row = await readRow(id);
    expect(row).toMatchObject({ status: "failed", attempts: 5, nextRetryAt: null, lockedBy: null });
    expect(row.lastError).toMatch(/did not finish after 5 attempts/);
  });

  it("never claims a cancelled row", async () => {
    const id = await insertRow(fx.workspaceId, { status: "cancelled" });

    const result = await processEmailOutbox({ ids: [id], workspaceId: fx.workspaceId });

    expect(result.processed).toBe(0);
    expect(await readRow(id)).toMatchObject({ status: "cancelled", attempts: 0 });
  });

  it("does not claim a row whose retry window has not opened yet", async () => {
    const id = await insertRow(fx.workspaceId, {
      nextRetryAt: new Date(Date.now() + 60 * 60_000),
    });

    const result = await processEmailOutbox({ ids: [id], workspaceId: fx.workspaceId });

    expect(result.processed).toBe(0);
    expect((await readRow(id)).attempts).toBe(0);
  });
});
