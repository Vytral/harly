import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  isLiveSandboxWorkspace: vi.fn(),
  values: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: {
    insert: () => ({
      values: (row: unknown) => {
        mocks.values(row);
        return { onConflictDoUpdate: async () => undefined };
      },
    }),
  },
  workspaceSettings: { organizationId: "organization_id" },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/features/demo/sandbox-access", () => ({
  isLiveSandboxWorkspace: mocks.isLiveSandboxWorkspace,
}));

import { CAREER_PRESETS } from "./config";
import { saveCareerPageConfigAction } from "./actions";

describe("saveCareerPageConfigAction in the public demo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  function allow() {
    mocks.requirePermission.mockResolvedValue({
      organization: { id: "org-1", slug: "sbx-1" },
      user: { id: "user-1", email: "a@b.c" },
    });
  }

  it("rejects the shared template workspace", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    allow();
    mocks.isLiveSandboxWorkspace.mockResolvedValue(false);
    const result = await saveCareerPageConfigAction(CAREER_PRESETS.minimal());
    expect(result).toEqual({ success: false, error: "This action is disabled in the demo." });
    expect(mocks.values).not.toHaveBeenCalled();
  });

  it("publishes for a live sandbox but forces it out of search indexes", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    allow();
    mocks.isLiveSandboxWorkspace.mockResolvedValue(true);
    const config = CAREER_PRESETS.minimal();
    config.seo.indexable = true;
    const result = await saveCareerPageConfigAction(config);
    expect(result).toEqual({ success: true });
    const saved = mocks.values.mock.calls[0][0] as { careerPageConfig: { seo: { indexable: boolean } } };
    expect(saved.careerPageConfig.seo.indexable).toBe(false);
  });

  it("leaves normal installs untouched", async () => {
    allow();
    const config = CAREER_PRESETS.minimal();
    config.seo.indexable = true;
    expect(await saveCareerPageConfigAction(config)).toEqual({ success: true });
    expect(mocks.isLiveSandboxWorkspace).not.toHaveBeenCalled();
    const saved = mocks.values.mock.calls[0][0] as { careerPageConfig: { seo: { indexable: boolean } } };
    expect(saved.careerPageConfig.seo.indexable).toBe(true);
  });
});
