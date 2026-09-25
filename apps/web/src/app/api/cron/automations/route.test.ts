import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorizeCron: vi.fn() }));

vi.mock("@/features/automations/dispatch", () => ({}));
vi.mock("@/features/automations/runtime/worker", () => ({}));
vi.mock("@/features/automations/run-repair", () => ({}));
vi.mock("@/lib/ai/agent/action-receipts", () => ({}));
vi.mock("@/features/ai-chat/data", () => ({}));
vi.mock("@/features/automations/ai-jobs", () => ({}));
vi.mock("@/server/cron-auth", () => ({ authorizeCron: mocks.authorizeCron }));
vi.mock("@/server/cron-runs", () => ({ startCronRun: vi.fn() }));

import { POST } from "./route";

describe("automations cron in public demo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("returns a controlled denial before cron authorization or job dispatch", async () => {
    vi.stubEnv("DEMO_MODE", "true");

    const response = await POST(new Request("https://example.test/api/cron/automations") as never);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "DEMO_ACTION_DISABLED",
      error: "This action is disabled in the demo.",
    });
    expect(mocks.authorizeCron).not.toHaveBeenCalled();
  });
});
