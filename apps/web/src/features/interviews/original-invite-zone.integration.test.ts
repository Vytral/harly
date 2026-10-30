import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { db, emailOutbox } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import {
  interviewEmailDedupeKey,
  interviewInviteKeyRange,
  resolveOriginalInviteTimeZone,
} from "./email-queue";

const NOISE_ROWS = 20_000;
const BATCH = 1_000;

describe.skipIf(!runPipelineIntegration)("original invite time zone lookup", () => {
  let fx: PipelineFixture;
  const interviewId = randomUUID();
  const scheduledAt = "2026-11-02T15:00:00.000Z";

  beforeAll(async () => {
    fx = await createPipelineFixture();

    // The original invite, its later reschedule (a different kind, same interview)
    // and a second interview's invite that shares the same payload zone.
    await db.insert(emailOutbox).values([
      {
        workspaceId: fx.workspaceId,
        kind: "interview.scheduled",
        payload: { interviewId, timeZone: "Europe/Berlin", scheduledAt },
        dedupeKey: interviewEmailDedupeKey({ interviewId, kind: "interview.scheduled", scheduledAt, revision: 1 }),
      },
      {
        workspaceId: fx.workspaceId,
        kind: "interview.rescheduled",
        payload: { interviewId, timeZone: "America/New_York", scheduledAt },
        dedupeKey: interviewEmailDedupeKey({ interviewId, kind: "interview.rescheduled", scheduledAt, revision: 2 }),
      },
    ]);

    // Noise: many other interviews' invites and unrelated outbox rows, so the
    // lookup has to find one row among tens of thousands.
    const noise: Array<typeof emailOutbox.$inferInsert> = [];
    for (let i = 0; i < NOISE_ROWS; i += 1) {
      const otherId = randomUUID();
      noise.push({
        workspaceId: fx.workspaceId,
        kind: i % 3 === 0 ? "interview.scheduled" : "pipeline.stage",
        payload: { interviewId: otherId, timeZone: "UTC" },
        dedupeKey: interviewEmailDedupeKey({
          interviewId: otherId,
          kind: "interview.scheduled",
          scheduledAt,
          revision: i,
        }),
      });
    }
    for (let i = 0; i < noise.length; i += BATCH) {
      await db.insert(emailOutbox).values(noise.slice(i, i + BATCH));
    }
    await db.execute(sql`ANALYZE email_outbox`);
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("returns the zone of the original invite, not a reschedule's zone", async () => {
    await expect(resolveOriginalInviteTimeZone(fx.workspaceId, interviewId)).resolves.toBe("Europe/Berlin");
  });

  it("returns null for an interview with no invite", async () => {
    await expect(resolveOriginalInviteTimeZone(fx.workspaceId, randomUUID())).resolves.toBeNull();
  });

  it("returns null for another workspace's invite", async () => {
    await expect(resolveOriginalInviteTimeZone(randomUUID(), interviewId)).resolves.toBeNull();
  });

  it("reads the invite through the dedupe-key index, not a scan of the outbox", async () => {
    const range = interviewInviteKeyRange(interviewId);
    const plan = await db.execute(sql`
      EXPLAIN SELECT payload FROM email_outbox
      WHERE workspace_id = ${fx.workspaceId}
        AND kind = 'interview.scheduled'
        AND dedupe_key >= ${range.lower}
        AND dedupe_key < ${range.upper}
        AND payload->>'interviewId' = ${interviewId}
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const text = (plan as unknown as Array<Record<string, string>>).map((row) => Object.values(row)[0]).join("\n");
    expect(text).toContain("email_outbox_workspace_dedupe_uidx");
    expect(text).not.toMatch(/Seq Scan on email_outbox/);
  });
});
