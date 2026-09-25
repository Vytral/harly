import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  safeFetchWebhook: vi.fn(),
  logAuditEvent: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(() => "where") }));
vi.mock("@harly/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
  workspaceSettings: {
    organizationId: "organizationId",
    jitsiBaseUrl: "jitsiBaseUrl",
  },
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: mocks.logError }),
}));
vi.mock("@/lib/jitsi/config", () => ({
  DEFAULT_JITSI_BASE_URL: "https://meet.jit.si",
}));
vi.mock("@/lib/ssrf", () => ({ safeFetchWebhook: mocks.safeFetchWebhook }));

import { testJitsiConnectionAction } from "./jitsi-settings-actions";

describe("Jitsi outbound security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ organization: { id: "ws-1" } });
    mocks.safeFetchWebhook.mockResolvedValue({ ok: true, status: 200 });
  });

  it("routes connection checks through the SSRF-safe redirect validator", async () => {
    await expect(
      testJitsiConnectionAction({ baseUrl: "https://meet.example.com" }),
    ).resolves.toEqual({ ok: true });

    expect(mocks.safeFetchWebhook).toHaveBeenCalledWith(
      "https://meet.example.com",
      expect.objectContaining({
        method: "GET",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("rejects non-HTTPS connection targets before any request", async () => {
    await expect(
      testJitsiConnectionAction({ baseUrl: "http://meet.example.com" }),
    ).resolves.toEqual({ ok: false, error: "Base URL must use https." });
    expect(mocks.safeFetchWebhook).not.toHaveBeenCalled();
  });
});
