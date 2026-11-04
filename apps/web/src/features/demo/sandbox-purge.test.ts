import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as { id: string; metadata: string | null }[],
  deleteDemoSandbox: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn(), like: vi.fn(), sql: vi.fn() }));
vi.mock("@harly/config", () => ({ demoSandboxSettings: () => ({ ttlMinutes: 240, maxActive: 40 }) }));
vi.mock("@harly/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve(state.rows) }) }),
  },
  deleteDemoSandbox: state.deleteDemoSandbox,
  member: {},
  organization: { id: {}, metadata: {} },
  seedDemoWorkspace: vi.fn(),
  sql: {},
  user: {},
  workspaceSettings: {},
}));
vi.mock("@/features/career-page/config", () => ({ normalizeCareerPageConfig: vi.fn() }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }) }));
vi.mock("@/lib/storage", () => ({ storage: { list: async () => [], delete: vi.fn() } }));
vi.mock("./sandbox-styles", () => ({ applyDemoStyle: vi.fn() }));

import { purgeExpiredSandboxes, SANDBOX_ENTRY_PURGE_LIMIT } from "./sandbox";

const NOW = new Date("2026-11-04T12:00:00Z");
const meta = (expiresAt: string) =>
  JSON.stringify({ harlyDemoSandbox: { expiresAt, style: "", ownerUserId: "u" } });

beforeEach(() => {
  state.deleteDemoSandbox.mockReset();
  state.rows = [
    { id: "live", metadata: meta("2026-11-04T13:00:00Z") },
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `expired-${i}`,
      metadata: meta("2026-11-04T10:00:00Z"),
    })),
  ];
});

describe("purgeExpiredSandboxes", () => {
  it("purges the whole expired backlog when unbounded (cron path)", async () => {
    await expect(purgeExpiredSandboxes(NOW)).resolves.toBe(8);
    const ids = state.deleteDemoSandbox.mock.calls.map(([arg]) => arg.workspaceId);
    expect(ids).not.toContain("live");
  });

  it("purges at most the entry limit on the visitor path", async () => {
    await expect(purgeExpiredSandboxes(NOW, SANDBOX_ENTRY_PURGE_LIMIT)).resolves.toBe(
      SANDBOX_ENTRY_PURGE_LIMIT,
    );
    expect(state.deleteDemoSandbox).toHaveBeenCalledTimes(SANDBOX_ENTRY_PURGE_LIMIT);
  });

  it("never deletes a live sandbox", async () => {
    state.rows = [{ id: "live", metadata: meta("2026-11-04T13:00:00Z") }];
    await expect(purgeExpiredSandboxes(NOW)).resolves.toBe(0);
    expect(state.deleteDemoSandbox).not.toHaveBeenCalled();
  });
});
