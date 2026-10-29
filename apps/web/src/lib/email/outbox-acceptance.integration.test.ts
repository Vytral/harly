import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

// Only the provider is replaced. Claim, reclaim, bookkeeping and the DB writes
// are the real SQL the worker runs in production.
vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return { ...actual, sendWorkspaceEmail: mocks.sendWorkspaceEmail };
});

import { DeliveryOutcomeUnknownError } from "@harly/emails";

import { processEmailOutbox } from "./outbox-processor";

type Db = typeof db;

/**
 * A database handle whose success writes (`sentAt`, `status: 'sent'`) fail while
 * `armed.on` is set. Models a connection that drops right after the provider
 * accepted the email. All other statements pass through unchanged.
 */
function bookkeepingFailsAfterAccept(armed: { on: boolean }): Db {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === "update") {
        return (table: Parameters<Db["update"]>[0]) => {
          const chain = target.update(table);
          return {
            set: (values: Record<string, unknown>) => {
              if (armed.on && (values.sentAt !== undefined || values.status === "sent")) {
                throw new Error("connection reset after accept");
              }
              return chain.set(values as never);
            },
          };
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Db;
}

async function insertReport(workspaceId: string) {
  const [row] = await db
    .insert(emailOutbox)
    .values({
      workspaceId,
      kind: "report.scheduled",
      payload: {
        to: "report-owner@example.com",
        subject: "Weekly",
        bodyHtml: "<p>Weekly summary</p>",
        companyName: "Fixture",
      },
      dedupeKey: `accept-${crypto.randomUUID()}`,
    })
    .returning({ id: emailOutbox.id });
  return row.id;
}

async function readRow(id: string) {
  const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id)).limit(1);
  return row;
}

describe.skipIf(!runPipelineIntegration)("email outbox after provider acceptance", () => {
  let fx: PipelineFixture;

  beforeAll(async () => {
    fx = await createPipelineFixture();
  });
  afterAll(async () => {
    await fx?.cleanup();
  });

  it(
    "never re-sends an accepted email when the success write fails, even across later claim cycles",
    async () => {
      mocks.sendWorkspaceEmail.mockReset();
      mocks.sendWorkspaceEmail.mockResolvedValue({ messageId: "provider-accepted-1" });
      const id = await insertReport(fx.workspaceId);
      const armed = { on: true };

      await processEmailOutbox({
        ids: [id],
        workspaceId: fx.workspaceId,
        database: bookkeepingFailsAfterAccept(armed),
      });
      armed.on = false;

      let row = await readRow(id);
      expect(mocks.sendWorkspaceEmail).toHaveBeenCalledTimes(1);
      // Held, not retryable: no claim path picks a failed row, and it carries the provider id.
      expect(row.status).toBe("failed");
      expect(row.nextRetryAt).toBeNull();
      expect(row.providerMessageId).toBe("provider-accepted-1");
      expect(row.lastError).toMatch(/accepted/i);

      // A healthy later cycle must not claim it.
      await processEmailOutbox({ ids: [id], workspaceId: fx.workspaceId });
      expect(mocks.sendWorkspaceEmail).toHaveBeenCalledTimes(1);

      // Even a later worker that is handed the row by id cannot send it again.
      await processEmailOutbox({ ids: [id], workspaceId: fx.workspaceId });
      expect(mocks.sendWorkspaceEmail).toHaveBeenCalledTimes(1);
      row = await readRow(id);
      expect(row.status).toBe("failed");
    },
    60_000,
  );

  it("does not send again when the acceptance write and the success write both fail and the failure write still lands", async () => {
    mocks.sendWorkspaceEmail.mockReset();
    mocks.sendWorkspaceEmail.mockResolvedValue({ messageId: "provider-accepted-2" });
    const id = await insertReport(fx.workspaceId);
    const armed = { on: true };
    const handle = new Proxy(db, {
      get(target, prop) {
        if (prop !== "update") {
          const value = Reflect.get(target, prop, target);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return (table: Parameters<Db["update"]>[0]) => {
          const chain = target.update(table);
          return {
            set: (values: Record<string, unknown>) => {
              // The provider id and the success write are refused; the
              // failure write (status pending) still goes through.
              if (armed.on && (values.providerMessageId !== undefined || values.sentAt !== undefined || values.status === "sent")) {
                throw new Error("connection reset after accept");
              }
              return chain.set(values as never);
            },
          };
        };
      },
    }) as Db;

    await processEmailOutbox({ ids: [id], workspaceId: fx.workspaceId, database: handle });
    armed.on = false;
    // Make the row eligible again, as a retry window opening would.
    await db
      .update(emailOutbox)
      .set({ nextRetryAt: new Date(Date.now() - 1_000) })
      .where(eq(emailOutbox.id, id));
    await processEmailOutbox({ ids: [id], workspaceId: fx.workspaceId });

    expect(mocks.sendWorkspaceEmail).toHaveBeenCalledTimes(1);
    expect((await readRow(id)).status).not.toBe("pending");
  }, 60_000);

  it("does not auto-retry an SMTP send whose outcome is unknown, and says so", async () => {
    mocks.sendWorkspaceEmail.mockReset();
    mocks.sendWorkspaceEmail.mockRejectedValue(
      new DeliveryOutcomeUnknownError("SMTP connection timed out after DATA"),
    );
    const id = await insertReport(fx.workspaceId);

    await processEmailOutbox({ ids: [id], workspaceId: fx.workspaceId });
    let row = await readRow(id);
    expect(row).toMatchObject({ status: "failed", nextRetryAt: null });
    expect(row.lastError).toMatch(/outcome unknown/i);

    await processEmailOutbox({ ids: [id], workspaceId: fx.workspaceId });
    expect(mocks.sendWorkspaceEmail).toHaveBeenCalledTimes(1);
    row = await readRow(id);
    expect(row.status).toBe("failed");
  });

  it("stops claiming rows once the caller's deadline has passed, and releases them untouched", async () => {
    mocks.sendWorkspaceEmail.mockReset();
    mocks.sendWorkspaceEmail.mockResolvedValue({ messageId: "should-not-happen" });
    const first = await insertReport(fx.workspaceId);
    const second = await insertReport(fx.workspaceId);

    const result = await processEmailOutbox({
      ids: [first, second],
      workspaceId: fx.workspaceId,
      deadlineAt: Date.now() - 1,
    });

    expect(result.sent).toBe(0);
    expect(mocks.sendWorkspaceEmail).not.toHaveBeenCalled();
    for (const id of [first, second]) {
      expect(await readRow(id)).toMatchObject({ status: "pending", attempts: 0, lockedBy: null });
    }
  });
});
