import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createWorkflow: vi.fn(),
  dryRunWorkflow: vi.fn(),
  previewWorkflowPayload: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("./data", () => ({ createWorkflow: mocks.createWorkflow }));
vi.mock("./builder-data", () => ({
  dryRunWorkflow: mocks.dryRunWorkflow,
  previewWorkflowPayload: mocks.previewWorkflowPayload,
}));
vi.mock("./registry", () => ({}));
vi.mock("./webhook-ingress", () => ({}));
vi.mock("./runtime/worker", () => ({}));
vi.mock("./publish-validation", () => ({}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import {
  createWorkflowAction,
  dryRunWorkflowAction,
  previewWorkflowPayloadAction,
} from "./actions";

describe("automation server actions in public demo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("rejects a direct workflow creation call before permission lookup or persistence", async () => {
    vi.stubEnv("DEMO_MODE", "true");

    const result = await createWorkflowAction({} as never);

    expect(result).toMatchObject({ ok: false, error: "This action is disabled in the demo." });
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.createWorkflow).not.toHaveBeenCalled();
  });

  it("rejects an arbitrary dry-run graph before it is simulated", async () => {
    vi.stubEnv("DEMO_MODE", "true");

    const result = await dryRunWorkflowAction({ graph: {} as never });

    expect(result).toMatchObject({ ok: false, error: "This action is disabled in the demo." });
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.dryRunWorkflow).not.toHaveBeenCalled();
  });

  it("rejects payload previews before querying demo workspace data", async () => {
    vi.stubEnv("DEMO_MODE", "true");

    const result = await previewWorkflowPayloadAction({ trigger: {} as never });

    expect(result).toMatchObject({ ok: false, error: "This action is disabled in the demo." });
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.previewWorkflowPayload).not.toHaveBeenCalled();
  });
});
