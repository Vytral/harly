import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: { select: mocks.select },
  integrationHealth: {
    workspaceId: {},
    integration: {},
    state: {},
    lastOkAt: {},
    lastErrorAt: {},
    lastError: {},
    consecutiveFailures: {},
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: mocks.warn, info: vi.fn() }),
}));

import { getIntegrationHealth } from "./repository";

function unavailableTable() {
  mocks.select.mockReturnValue({
    from: () => ({
      where: async () => {
        throw new Error('relation "integration_health" does not exist');
      },
    }),
  });
}

describe("getIntegrationHealth is fail-soft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns no stored rows when the read fails, so callers still render from configuration", async () => {
    unavailableTable();
    await expect(getIntegrationHealth("workspace-1")).resolves.toEqual({});
  });

  it("logs the read failure once, not on every call", async () => {
    vi.resetModules();
    const fresh = await import("./repository");
    unavailableTable();
    await fresh.getIntegrationHealth("workspace-1");
    await fresh.getIntegrationHealth("workspace-1");
    expect(mocks.warn).toHaveBeenCalledTimes(1);
  });
});
