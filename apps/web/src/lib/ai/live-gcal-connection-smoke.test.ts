import { config as loadEnv } from "dotenv";
import { describe, expect, it, vi } from "vitest";

const liveState = vi.hoisted(() => ({
  workspaceId: "",
}));

// `server-only` is provided by Next.js at runtime, but is intentionally
// virtual in this Vitest integration test.
// @ts-expect-error Vitest's type declaration omits the virtual-module option.
vi.mock("server-only", () => ({}), { virtual: true });
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: vi.fn(async () => ({
    organization: { id: liveState.workspaceId },
    user: { id: "live-gcal-smoke" },
  })),
}));

const live = process.env.LIVE_GCAL_CONNECTION_SMOKE === "1";

describe.skipIf(!live)("live Google Calendar connection smoke test", () => {
  it("checks the stored OAuth connection through the real Settings action", async () => {
    loadEnv({
      path: `${process.cwd()}/../../.env.local`,
      quiet: true,
    });

    const [{ db, workspaceSettings }, { eq }] = await Promise.all([
      import("@harly/db"),
      import("drizzle-orm"),
    ]);
    const { testGCalConnectionAction } = await import(
      "@/features/workspaces/gcal-settings-actions"
    );

    const [workspace] = await db
      .select({ id: workspaceSettings.organizationId })
      .from(workspaceSettings)
      .limit(1);
    expect(workspace?.id).toBeTruthy();
    liveState.workspaceId = workspace!.id;

    const result = await testGCalConnectionAction();
    if (result.ok) {
      expect(result).toEqual({ ok: true });
      return;
    }

    expect(result.error).toMatch(/not connected|reconnect/i);
    const [afterInvalidGrant] = await db
      .select({
        enabled: workspaceSettings.gcalEnabled,
        hasRefreshToken:
          workspaceSettings.gcalRefreshTokenCiphertext,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, liveState.workspaceId))
      .limit(1);
    expect(afterInvalidGrant).toMatchObject({
      enabled: false,
      hasRefreshToken: null,
    });
  }, 60_000);
});
