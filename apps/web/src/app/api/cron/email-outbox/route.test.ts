import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processEmailOutbox: vi.fn(),
  authorizeCron: vi.fn(),
  finish: vi.fn(),
  release: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }) },
}));
vi.mock("@harly/db", () => ({
  db: { select: () => ({ from: () => ({ where: async () => [{ count: 3 }] }) }) },
  emailOutbox: { status: "status" },
}));
vi.mock("drizzle-orm", () => ({ eq: (...v: unknown[]) => v, sql: (...v: unknown[]) => v }));
vi.mock("@/lib/email/outbox-processor", () => ({ processEmailOutbox: mocks.processEmailOutbox }));
vi.mock("@/server/cron-auth", () => ({ authorizeCron: mocks.authorizeCron }));
vi.mock("@/server/cron-runs", () => ({
  startCronRun: () => ({ runId: "run-1", finish: mocks.finish }),
}));

import { POST } from "./route";

const CRON_BUDGET_MS = 120_000;

describe("POST /api/cron/email-outbox", () => {
  beforeEach(() => {
    mocks.processEmailOutbox.mockReset();
    mocks.finish.mockReset();
    mocks.release.mockReset();
    mocks.authorizeCron.mockResolvedValue({ ok: true, release: mocks.release });
    mocks.processEmailOutbox.mockResolvedValue({ processed: 0, sent: 0, failed: 0, skipped: 0 });
  });

  it("gives the batch a wall-clock budget that ends well before the scheduler's 150 second timeout", async () => {
    const before = Date.now();

    await POST({ headers: new Headers() } as never);

    const options = mocks.processEmailOutbox.mock.calls[0][0] as { deadlineAt: number };
    expect(options.deadlineAt).toBeGreaterThanOrEqual(before + CRON_BUDGET_MS - 1_000);
    expect(options.deadlineAt).toBeLessThanOrEqual(before + CRON_BUDGET_MS + 1_000);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
