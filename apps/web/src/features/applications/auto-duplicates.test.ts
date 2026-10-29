import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settingsRows: [] as unknown[][],
  getWorkspaceAiConfig: vi.fn(),
  detect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({
  and: (...parts: unknown[]) => parts,
  eq: (...parts: unknown[]) => parts,
  or: (...parts: unknown[]) => parts,
}));
vi.mock("@harly/db", () => {
  const query = () => {
    const q: Record<string, unknown> = {};
    q.from = () => q;
    q.where = () => q;
    q.limit = async () => mocks.settingsRows.shift() ?? [];
    return q;
  };
  return {
    db: { select: query, transaction: vi.fn() },
    activityEvents: { id: {}, workspaceId: {}, entityType: {}, entityId: {}, type: {} },
    member: { userId: {}, organizationId: {}, role: {} },
    notifications: {},
    workspaceSettings: { aiDuplicateCheck: {}, organizationId: {} },
  };
});
vi.mock("@/features/candidates/duplicate-detection", () => ({
  detectCandidateDuplicatesForWorkspace: mocks.detect,
}));
vi.mock("@/lib/ai/config", () => ({ getWorkspaceAiConfig: mocks.getWorkspaceAiConfig }));

import { scheduleAutoDuplicateCheck } from "./auto-duplicates";

const AI = { provider: "openai", modelId: "gpt-4o", apiKey: "sk-test" };

describe("scheduleAutoDuplicateCheck", () => {
  beforeEach(() => {
    mocks.settingsRows = [[{ aiDuplicateCheck: true }]];
    mocks.getWorkspaceAiConfig.mockReset();
    mocks.detect.mockReset().mockResolvedValue([]);
  });

  it("returns without running detection or logging when anonymization is on", async () => {
    mocks.getWorkspaceAiConfig.mockResolvedValue({ ...AI, resumeAnonymization: true });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await scheduleAutoDuplicateCheck("candidate-1", "workspace-1");

    expect(mocks.detect).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it("runs detection when anonymization is off", async () => {
    mocks.getWorkspaceAiConfig.mockResolvedValue({ ...AI, resumeAnonymization: false });

    await scheduleAutoDuplicateCheck("candidate-1", "workspace-1");

    expect(mocks.detect).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1", candidateId: "candidate-1" }),
    );
  });
});
