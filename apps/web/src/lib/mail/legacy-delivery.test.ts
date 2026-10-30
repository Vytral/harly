import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  mailIdempotencyKeys: {
    id: "id",
    workspaceId: "workspaceId",
    idempotencyKey: "idempotencyKey",
    status: "status",
    messageId: "messageId",
  },
  db: mocks,
}));

vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  eq: (...values: unknown[]) => values,
  or: (...values: unknown[]) => values,
}));

import {
  reserveLegacyMailDelivery,
  resolveUnknownMailDelivery,
} from "./legacy-delivery";

function insertChain(result: unknown[]) {
  return {
    values: () => ({
      onConflictDoNothing: () => ({ returning: async () => result }),
    }),
  };
}

function updateChain(result: unknown[]) {
  return {
    set: () => ({
      where: () => ({ returning: async () => result }),
    }),
  };
}

describe("legacy mail delivery idempotency", () => {
  beforeEach(() => {
    mocks.insert.mockReset();
    mocks.select.mockReset();
    mocks.update.mockReset();
  });

  it("claims a new reservation before delivery", async () => {
    mocks.insert.mockReturnValue(insertChain([{ id: "reservation-1", messageId: "<mail-1@harly.local>" }]));
    mocks.update.mockReturnValue(updateChain([{ id: "reservation-1", messageId: "<mail-1@harly.local>" }]));

    await expect(reserveLegacyMailDelivery({
      workspaceId: "workspace-1",
      idempotencyKey: "attempt-1",
      payload: { body: "Hello" },
    })).resolves.toEqual({ kind: "reserved", id: "reservation-1", messageId: "<mail-1@harly.local>" });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("replays a completed reservation and rejects payload reuse", async () => {
    mocks.insert.mockReturnValue(insertChain([]));
    const existing = {
      id: "reservation-1",
      workspaceId: "workspace-1",
      idempotencyKey: "attempt-1",
      payloadHash: createHash("sha256").update(JSON.stringify({ body: "Hello" })).digest("hex"),
      status: "sent",
      messageId: "<mail-1@harly.local>",
      threadId: "thread-1",
      providerMessageId: "provider-1",
    };
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [existing],
        }),
      }),
    });

    await expect(reserveLegacyMailDelivery({
      workspaceId: "workspace-1",
      idempotencyKey: "attempt-1",
      payload: { body: "Hello" },
    })).resolves.toEqual({
      kind: "replay",
      messageId: "<mail-1@harly.local>",
      threadId: "thread-1",
      providerMessageId: "provider-1",
    });

    existing.payloadHash = "not-the-current-payload";
    await expect(reserveLegacyMailDelivery({
      workspaceId: "workspace-1",
      idempotencyKey: "attempt-1",
      payload: { body: "Hello" },
    })).rejects.toThrow("different email");
  });

  it("returns unknown (not a throw) when an earlier attempt's outcome is unconfirmed", async () => {
    mocks.insert.mockReturnValue(insertChain([]));
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [{
            id: "reservation-2",
            workspaceId: "workspace-1",
            idempotencyKey: "attempt-2",
            payloadHash: createHash("sha256").update(JSON.stringify({ body: "Hello" })).digest("hex"),
            status: "unknown",
            messageId: "<mail-2@harly.local>",
            threadId: null,
            providerMessageId: null,
          }],
        }),
      }),
    });

    await expect(reserveLegacyMailDelivery({
      workspaceId: "workspace-1",
      idempotencyKey: "attempt-2",
      payload: { body: "Hello" },
    })).resolves.toEqual({ kind: "unknown", id: "reservation-2", messageId: "<mail-2@harly.local>" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns in_progress for a key another request is still sending", async () => {
    mocks.insert.mockReturnValue(insertChain([]));
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [{
            id: "reservation-3",
            workspaceId: "workspace-1",
            idempotencyKey: "attempt-3",
            payloadHash: createHash("sha256").update(JSON.stringify({ body: "Hello" })).digest("hex"),
            status: "sending",
            messageId: "<mail-3@harly.local>",
          }],
        }),
      }),
    });

    await expect(reserveLegacyMailDelivery({
      workspaceId: "workspace-1",
      idempotencyKey: "attempt-3",
      payload: { body: "Hello" },
    })).resolves.toEqual({ kind: "in_progress" });
  });

  it("resolves only an unknown row to sent, and reports when nothing matched", async () => {
    mocks.update.mockReturnValueOnce(updateChain([{ id: "reservation-2" }]));
    await expect(resolveUnknownMailDelivery({ workspaceId: "workspace-1", idempotencyKey: "attempt-2" })).resolves.toBe(true);

    mocks.update.mockReturnValueOnce(updateChain([]));
    await expect(resolveUnknownMailDelivery({ workspaceId: "workspace-1", idempotencyKey: "attempt-9" })).resolves.toBe(false);
  });
});
