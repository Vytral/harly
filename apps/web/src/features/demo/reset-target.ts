import { parseSandboxMetadata } from "./sandbox-metadata";

export type DemoResetTarget =
  | { ok: true; workspaceId: string }
  | {
      ok: false;
      reason: "pin_required" | "pin_mismatch" | "sandbox_workspace";
      message: string;
    };

/**
 * Decide which workspace the scheduled demo reset may wipe. The reset runs
 * unattended, so it wipes only the workspace the operator pinned with
 * DEMO_WORKSPACE_ID, and never a per-visitor sandbox, which has its own expiry.
 * The template has no flag of its own, so the pin is what identifies it.
 */
export function resolveDemoResetTarget(input: {
  pinnedWorkspaceId: string | null;
  memberOrganizationId: string;
  organizationMetadata: string | null;
}): DemoResetTarget {
  if (input.pinnedWorkspaceId === null) {
    return {
      ok: false,
      reason: "pin_required",
      message:
        "DEMO_WORKSPACE_ID must be set when DEMO_MODE is on. The demo reset refuses to wipe a workspace it was not pinned to, so nothing was deleted.",
    };
  }
  if (input.pinnedWorkspaceId !== input.memberOrganizationId) {
    return {
      ok: false,
      reason: "pin_mismatch",
      message:
        "Demo workspace does not match DEMO_WORKSPACE_ID, so nothing was deleted.",
    };
  }
  if (parseSandboxMetadata(input.organizationMetadata) !== null) {
    return {
      ok: false,
      reason: "sandbox_workspace",
      message:
        "The pinned workspace is a per-visitor sandbox. Sandboxes expire on their own, so the reset refused to wipe it.",
    };
  }
  return { ok: true, workspaceId: input.memberOrganizationId };
}
