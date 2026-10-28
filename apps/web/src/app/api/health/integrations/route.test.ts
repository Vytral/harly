import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  statuses: vi.fn(),
  can: vi.fn(),
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContextOrNull: mocks.context,
}));
vi.mock("@/features/workspaces/integrations-registry", () => ({
  getIntegrationStatuses: mocks.statuses,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({ can: mocks.can }));

import { INTEGRATION_HEALTH_KEYS } from "@/features/integrations/health/model";

import { GET } from "./route";

const view = (integration: string) => ({
  integration,
  state: "connected",
  configured: true,
  connected: true,
  reconnectRequired: false,
  needsAttention: false,
  lastOkAt: null,
  lastErrorAt: null,
  lastError: "should not reach non-managers",
  consecutiveFailures: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ organization: { id: "ws-1" } });
  mocks.statuses.mockResolvedValue({
    docuseal: { enabled: true, webhookSecret: "whsec_leak_me", hasWebhookSecret: true },
    health: Object.fromEntries(INTEGRATION_HEALTH_KEYS.map((k) => [k, view(k)])),
  });
});

describe("GET /api/health/integrations", () => {
  it("rejects signed-out callers", async () => {
    mocks.context.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("never exposes the DocuSeal webhook secret, even to managers", async () => {
    mocks.can.mockResolvedValue(true);
    const response = await GET();
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).not.toContain("whsec_leak_me");
    expect(JSON.parse(text).statuses.docuseal.hasWebhookSecret).toBe(true);
    expect(mocks.can).toHaveBeenCalledWith("integrations:manage");
  });

  it("returns only coarse states to members who cannot manage integrations", async () => {
    mocks.can.mockResolvedValue(false);
    const body = await (await GET()).json();
    expect(body.statuses).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("whsec_leak_me");
    expect(JSON.stringify(body)).not.toContain("should not reach non-managers");
    expect(body.integrations).toHaveLength(INTEGRATION_HEALTH_KEYS.length);
  });
});
