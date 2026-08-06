import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
  requirePermission: vi.fn(),
  isEncryptionConfigured: vi.fn(),
  encryptSecret: vi.fn(),
  getWorkspaceEsignStatus: vi.fn(),
  getWorkspaceEsignConfig: vi.fn(),
  resolveSafeAddress: vi.fn(),
  safeFetchHttp: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(() => "where") }));
vi.mock("@harly/db", () => ({
  db: { insert: mocks.dbInsert, update: mocks.dbUpdate },
  workspaceSettings: { organizationId: "organizationId" },
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/crypto", () => ({
  encryptSecret: mocks.encryptSecret,
  isEncryptionConfigured: mocks.isEncryptionConfigured,
}));
vi.mock("@/lib/esign/config", () => ({
  getWorkspaceEsignStatus: mocks.getWorkspaceEsignStatus,
  getWorkspaceEsignConfig: mocks.getWorkspaceEsignConfig,
}));
vi.mock("@/lib/ssrf", () => ({
  resolveSafeAddress: mocks.resolveSafeAddress,
  safeFetchHttp: mocks.safeFetchHttp,
}));

import {
  saveEsignSettingsAction,
  testEsignAction,
} from "./esign-settings-actions";

describe("DocuSeal outbound security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ organization: { id: "ws-1" } });
    mocks.isEncryptionConfigured.mockReturnValue(true);
    mocks.resolveSafeAddress.mockResolvedValue({
      address: "203.0.113.10",
      family: 4,
    });
    mocks.getWorkspaceEsignStatus.mockResolvedValue({
      hasToken: true,
      hasWebhookSecret: true,
      url: "https://sign.example.com",
    });
  });

  it("does not reuse a stored token when the instance URL changes", async () => {
    const result = await saveEsignSettingsAction({
      url: "https://attacker.example",
      enabled: true,
    });

    expect(result).toEqual({
      ok: false,
      error: "Enter the DocuSeal API token when changing the instance URL.",
    });
    expect(mocks.dbInsert).not.toHaveBeenCalled();
  });

  it("uses the pinned, non-redirecting fetch for connection tests", async () => {
    mocks.getWorkspaceEsignConfig.mockResolvedValue({
      apiUrl: "https://sign.example.com/api",
      apiToken: "stored-token",
    });
    mocks.safeFetchHttp.mockResolvedValue(new Response(null, { status: 200 }));

    await expect(testEsignAction()).resolves.toEqual({ ok: true });
    expect(mocks.safeFetchHttp).toHaveBeenCalledWith(
      "https://sign.example.com/api/templates?limit=1",
      expect.objectContaining({
        redirect: "manual",
        headers: { "X-Auth-Token": "stored-token", Accept: "application/json" },
      }),
    );
  });
});
