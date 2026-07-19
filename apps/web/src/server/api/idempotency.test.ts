import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  created: null as { id: string } | null,
  existing: null as Record<string, unknown> | null,
  updateRows: [{ id: "record-1" }] as { id: string }[],
  updateSet: vi.fn(),
}));

vi.mock("@harly/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@harly/db")>();
  const tx = {
    delete: () => ({ where: async () => undefined }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => (mocks.created ? [mocks.created] : []),
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (mocks.existing ? [mocks.existing] : []),
        }),
      }),
    }),
  };
  return {
    ...actual,
    db: {
      transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx),
      update: () => ({
        set: (value: unknown) => {
          mocks.updateSet(value);
          return {
            where: () => ({ returning: async () => mocks.updateRows }),
          };
        },
      }),
      delete: () => ({
        where: () => ({ returning: async () => mocks.updateRows }),
      }),
    },
  };
});

import { reserveIdempotencyKey } from "./idempotency";

const context = { workspaceId: "ws-1", keyId: "key-1" };

function request(key: string | null, body = '{"name":"Ada"}') {
  return new Request("https://example.com/api/v1/candidates?source=api", {
    method: "POST",
    headers: key ? { "idempotency-key": key } : undefined,
    body,
  });
}

async function hashFor(body: string) {
  return createHash("sha256")
    .update("POST")
    .update("\n")
    .update("/api/v1/candidates")
    .update("?source=api")
    .update("\n")
    .update(Buffer.from(body))
    .digest("hex");
}

describe("reserveIdempotencyKey", () => {
  it("does nothing when POST has no Idempotency-Key", async () => {
    await expect(reserveIdempotencyKey(request(null), context)).resolves.toEqual({
      kind: "not_requested",
    });
  });

  it("reserves a new key then saves its response", async () => {
    mocks.created = { id: "record-1" };
    mocks.existing = null;
    mocks.updateRows = [{ id: "record-1" }];

    const result = await reserveIdempotencyKey(request("candidate-create-1"), context);

    expect(result.kind).toBe("reserved");
    if (result.kind === "reserved") {
      await result.complete({ status: 201, body: { data: { id: "candidate-1" } } });
    }
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", responseStatus: 201 }),
    );
  });

  it("replays stored response when key and request match", async () => {
    const body = '{"name":"Ada"}';
    mocks.created = null;
    mocks.existing = {
      requestHash: await hashFor(body),
      status: "completed",
      responseStatus: 201,
      responseBody: { data: { id: "candidate-1" } },
    };

    await expect(
      reserveIdempotencyKey(request("candidate-create-1", body), context),
    ).resolves.toMatchObject({
      kind: "replay",
      response: { status: 201, body: { data: { id: "candidate-1" } } },
    });
  });

  it("rejects same key when request body differs", async () => {
    mocks.created = null;
    mocks.existing = {
      requestHash: await hashFor('{"name":"Ada"}'),
      status: "completed",
      responseStatus: 201,
      responseBody: {},
    };

    await expect(
      reserveIdempotencyKey(request("candidate-create-1", '{"name":"Grace"}'), context),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });
  });
});
