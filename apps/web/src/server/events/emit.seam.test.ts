import { beforeEach, describe, expect, it, vi } from "vitest";

const { globalTransaction } = vi.hoisted(() => ({
  globalTransaction: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: {
    transaction: globalTransaction,
  },
  domainEventOutbox: {},
}));

vi.mock("./realtime", () => ({
  publishRealtimeEvent: vi.fn(),
}));

import { emitDomainEvent } from "./emit";

function isolatedDatabase() {
  return {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        insert: vi.fn(() => ({
          values: vi.fn(async () => undefined),
        })),
      }),
    ),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    })),
  };
}

describe("domain event database seam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists through the worker-provided database", async () => {
    const database = isolatedDatabase();

    const event = await emitDomainEvent(
      {
        name: "application.created",
        workspaceId: "workspace-1",
        payload: { application: { id: "application-1" } },
      },
      database as never,
    );

    expect(event.workspaceId).toBe("workspace-1");
    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(globalTransaction).not.toHaveBeenCalled();
  });
});
