import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeCron: vi.fn(),
  finish: vi.fn(),
  processEmailOutbox: vi.fn(),
  release: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => [{ count: 0 }] }) }),
  },
  emailOutbox: { status: "status" },
}));
vi.mock("@/lib/email/outbox-processor", () => ({ processEmailOutbox: mocks.processEmailOutbox }));
vi.mock("@/server/cron-auth", () => ({ authorizeCron: mocks.authorizeCron }));
vi.mock("@/server/cron-runs", () => ({
  startCronRun: () => ({ runId: "run-1", finish: mocks.finish }),
}));

import { POST } from "./route";

describe("email-outbox cron", () => {
  beforeEach(() => {
    mocks.finish.mockReset();
    mocks.processEmailOutbox.mockReset();
    mocks.release.mockReset();
    mocks.authorizeCron.mockReset().mockResolvedValue({ ok: true, release: mocks.release });
  });

  it("records the sanitized error on the run when processing throws", async () => {
    const failure = new Error("smtp relay refused the batch");
    mocks.processEmailOutbox.mockRejectedValue(failure);

    await expect(POST({} as never)).rejects.toThrow("smtp relay refused the batch");

    expect(mocks.finish).toHaveBeenCalledWith("failed", {}, failure);
    expect(mocks.release).toHaveBeenCalled();
  });
});
