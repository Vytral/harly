import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db, emailOutbox } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

const mocks = vi.hoisted(() => ({
  workspaceId: "",
  userId: "",
  allow: true,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: async () => ({
    organization: { id: mocks.workspaceId },
    user: { id: mocks.userId, email: "recruiter@example.test" },
  }),
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: async (permission: string) => {
    if (!mocks.allow) throw new Error("You do not have permission to perform this action.");
    expect(permission).toBe("settings:edit");
    return {};
  },
}));

import {
  cancelEmailDeliveryAction,
  listEmailDeliveryLogAction,
  retryEmailDeliveryAction,
} from "./actions";
import { DELIVERY_LOG_PAGE_SIZE, cancelDelivery, listDeliveryLog, retryDelivery } from "./service";

async function insertRow(workspaceId: string, status: string, extra: Partial<typeof emailOutbox.$inferInsert> = {}) {
  const [row] = await db
    .insert(emailOutbox)
    .values({
      workspaceId,
      kind: "pipeline.stage",
      // No candidate email: a retry fails before any provider call.
      payload: { jobTitle: "Engineer", stageName: "Interview" },
      status,
      dedupeKey: `log-${crypto.randomUUID()}`,
      ...extra,
    })
    .returning({ id: emailOutbox.id });
  return row.id;
}

describe.skipIf(!runPipelineIntegration)("delivery log", () => {
  let fx: PipelineFixture;
  let other: PipelineFixture;

  beforeAll(async () => {
    fx = await createPipelineFixture();
    other = await createPipelineFixture();
    mocks.workspaceId = fx.workspaceId;
    mocks.userId = fx.userId;
  });
  afterAll(async () => {
    await fx?.cleanup();
    await other?.cleanup();
  });

  it("lists only this workspace's rows and filters by status", async () => {
    const failedId = await insertRow(fx.workspaceId, "failed", { lastError: "Email provider did not accept" });
    await insertRow(fx.workspaceId, "sent", { sentAt: new Date(), providerMessageId: "prov-1" });
    await insertRow(other.workspaceId, "failed");

    const failed = await listDeliveryLog({ workspaceId: fx.workspaceId, filter: "failed", page: 1 });
    expect(failed.rows.map((row) => row.id)).toContain(failedId);
    expect(failed.rows.every((row) => row.status === "failed")).toBe(true);
    expect(failed.rows.find((row) => row.id === failedId)).toMatchObject({
      kindLabel: "Stage update",
      summary: "Engineer — moved to Interview",
      canRetry: true,
      canCancel: true,
    });

    const sent = await listDeliveryLog({ workspaceId: fx.workspaceId, filter: "sent", page: 1 });
    expect(sent.rows.every((row) => row.status === "sent")).toBe(true);
    expect(sent.rows.every((row) => row.canRetry === false)).toBe(true);
  });

  it("pages newest first with a next-page flag", async () => {
    const pageWorkspace = await createPipelineFixture();
    try {
      for (let index = 0; index < DELIVERY_LOG_PAGE_SIZE + 1; index += 1) {
        await insertRow(pageWorkspace.workspaceId, "failed");
      }
      const first = await listDeliveryLog({ workspaceId: pageWorkspace.workspaceId, filter: "all", page: 1 });
      const second = await listDeliveryLog({ workspaceId: pageWorkspace.workspaceId, filter: "all", page: 2 });
      expect(first.rows).toHaveLength(DELIVERY_LOG_PAGE_SIZE);
      expect(first.hasNext).toBe(true);
      expect(second.rows).toHaveLength(1);
      expect(second.hasPrevious).toBe(true);
    } finally {
      await pageWorkspace.cleanup();
    }
  });

  it("cancels a failed row so it is never sent, and refuses to cancel a sent one", async () => {
    const id = await insertRow(fx.workspaceId, "failed");
    await expect(cancelDelivery({ workspaceId: fx.workspaceId, id })).resolves.toEqual({ ok: true });
    const [cancelled] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id));
    expect(cancelled?.status).toBe("cancelled");

    const sentId = await insertRow(fx.workspaceId, "sent", { sentAt: new Date(), providerMessageId: "prov-2" });
    await expect(cancelDelivery({ workspaceId: fx.workspaceId, id: sentId })).resolves.toMatchObject({ ok: false });
  });

  it("retries a failed row now and leaves it pending with a fresh attempt count when the retry fails again", async () => {
    const id = await insertRow(fx.workspaceId, "failed", { attempts: 5 });
    const result = await retryDelivery({ workspaceId: fx.workspaceId, id });
    expect(result).toEqual({ ok: true, status: "pending" });
    const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id));
    // Reset to 0 by the operator, then one claim, then one failed attempt.
    expect(row?.attempts).toBe(1);
  });

  it("never retries a row the provider already accepted", async () => {
    const id = await insertRow(fx.workspaceId, "failed", { providerMessageId: "prov-3" });
    await expect(retryDelivery({ workspaceId: fx.workspaceId, id })).resolves.toMatchObject({ ok: false });
  });

  it("does not let another workspace act on a row it does not own", async () => {
    const id = await insertRow(other.workspaceId, "failed");
    await expect(cancelDelivery({ workspaceId: fx.workspaceId, id })).resolves.toMatchObject({ ok: false });
    const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id));
    expect(row?.status).toBe("failed");
  });

  it("denies the delivery log, retry and cancel to users without email settings access", async () => {
    const id = await insertRow(fx.workspaceId, "failed");
    mocks.allow = false;
    try {
      await expect(listEmailDeliveryLogAction({ filter: "all", page: 1 })).rejects.toThrow("do not have permission");
      await expect(retryEmailDeliveryAction({ id })).rejects.toThrow("do not have permission");
      await expect(cancelEmailDeliveryAction({ id })).rejects.toThrow("do not have permission");
    } finally {
      mocks.allow = true;
    }
    const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id));
    expect(row?.status).toBe("failed");
  });

  it("serves the log through the action for users with access", async () => {
    const result = await listEmailDeliveryLogAction({ filter: "all", page: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(Array.isArray(result.data.rows)).toBe(true);
  });
});
