import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  isEncryptionConfigured: vi.fn(),
  encryptSecret: vi.fn(),
  getWorkspaceCalConfig: vi.fn(),
  getWorkspaceCalStatus: vi.fn(),
  resolveSafeAddress: vi.fn(),
  verifyCalConnection: vi.fn(),
  dbInsert: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(() => "where") }));
vi.mock("@harly/db", () => ({
  db: { insert: mocks.dbInsert },
  workspaceSettings: { organizationId: "organizationId" },
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/cal/config", () => ({
  DEFAULT_CAL_BASE_URL: "https://api.cal.com/v2",
  getWorkspaceCalConfig: mocks.getWorkspaceCalConfig,
  getWorkspaceCalStatus: mocks.getWorkspaceCalStatus,
}));
vi.mock("@/lib/cal/client", () => ({
  registerCalWebhook: vi.fn(),
  verifyCalConnection: mocks.verifyCalConnection,
}));
vi.mock("@/lib/crypto", () => ({
  encryptSecret: mocks.encryptSecret,
  isEncryptionConfigured: mocks.isEncryptionConfigured,
}));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ error: vi.fn() }) }));
vi.mock("@/lib/ssrf", () => ({ resolveSafeAddress: mocks.resolveSafeAddress }));

import {
  saveCalSettingsAction,
  testCalConnectionAction,
} from "./cal-settings-actions";

describe("Cal outbound security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ organization: { id: "ws-1" } });
    mocks.isEncryptionConfigured.mockReturnValue(true);
    mocks.resolveSafeAddress.mockResolvedValue({
      address: "203.0.113.20",
      family: 4,
    });
    mocks.getWorkspaceCalStatus.mockResolvedValue({
      hasApiKey: true,
      hasWebhookSecret: true,
    });
    mocks.getWorkspaceCalConfig.mockResolvedValue({
      apiKey: "stored-key",
      baseUrl: "https://cal.example.com/v2",
    });
  });

  it("does not reuse a stored key when the instance URL changes", async () => {
    const result = await testCalConnectionAction({
      baseUrl: "https://attacker.example/v2",
    });

    expect(result).toEqual({
      ok: false,
      error: "Enter the Cal.com API key when changing the instance URL.",
    });
    expect(mocks.verifyCalConnection).not.toHaveBeenCalled();
  });

  it("does not save a changed instance URL with the stored key", async () => {
    const result = await saveCalSettingsAction({
      enabled: true,
      baseUrl: "https://attacker.example/v2",
      bookingUrl: "",
    });

    expect(result).toEqual({
      ok: false,
      error: "Enter the Cal.com API key when changing the instance URL.",
    });
    expect(mocks.dbInsert).not.toHaveBeenCalled();
  });

  it("rejects blocked destinations before persisting a Cal URL", async () => {
    mocks.resolveSafeAddress.mockRejectedValueOnce(
      new Error("URL points to a blocked host."),
    );

    const result = await saveCalSettingsAction({
      enabled: false,
      apiKey: "new-key",
      baseUrl: "https://127.0.0.1/v2",
      bookingUrl: "",
    });

    expect(result).toEqual({
      ok: false,
      error: "URL points to a blocked host.",
    });
    expect(mocks.dbInsert).not.toHaveBeenCalled();
  });

  it("keeps the stored key for the currently configured safe URL", async () => {
    mocks.verifyCalConnection.mockResolvedValueOnce(undefined);

    await expect(
      testCalConnectionAction({ baseUrl: "https://cal.example.com/v2/" }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.verifyCalConnection).toHaveBeenCalledWith({
      apiKey: "stored-key",
      baseUrl: "https://cal.example.com/v2",
    });
  });
});
