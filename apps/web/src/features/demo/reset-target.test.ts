import { describe, expect, it } from "vitest";

import { resolveDemoResetTarget } from "./reset-target";
import { serializeSandboxMetadata } from "./sandbox-metadata";

const TEMPLATE = "org_template_1";

const sandboxMetadata = serializeSandboxMetadata({
  expiresAt: "2030-01-01T00:00:00.000Z",
  style: "plain",
  ownerUserId: null,
});

describe("resolveDemoResetTarget", () => {
  it("refuses to reset without a DEMO_WORKSPACE_ID pin, and names the variable", () => {
    const target = resolveDemoResetTarget({
      pinnedWorkspaceId: null,
      memberOrganizationId: TEMPLATE,
      organizationMetadata: null,
    });

    expect(target.ok).toBe(false);
    if (target.ok) return;
    expect(target.reason).toBe("pin_required");
    expect(target.message).toContain("DEMO_WORKSPACE_ID");
    expect(target.message).toContain("nothing was deleted");
  });

  it("refuses a workspace other than the pinned one", () => {
    const target = resolveDemoResetTarget({
      pinnedWorkspaceId: "org_other",
      memberOrganizationId: TEMPLATE,
      organizationMetadata: null,
    });

    expect(target).toMatchObject({ ok: false, reason: "pin_mismatch" });
  });

  it("refuses the pinned workspace when it is a per-visitor sandbox", () => {
    const target = resolveDemoResetTarget({
      pinnedWorkspaceId: TEMPLATE,
      memberOrganizationId: TEMPLATE,
      organizationMetadata: sandboxMetadata,
    });

    expect(target).toMatchObject({ ok: false, reason: "sandbox_workspace" });
  });

  it("resets the pinned template workspace", () => {
    const target = resolveDemoResetTarget({
      pinnedWorkspaceId: TEMPLATE,
      memberOrganizationId: TEMPLATE,
      organizationMetadata: null,
    });

    expect(target).toEqual({ ok: true, workspaceId: TEMPLATE });
  });
});
