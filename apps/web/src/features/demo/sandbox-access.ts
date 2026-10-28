import "server-only";

import { isDemoMode } from "@harly/config";

import { getWorkspaceContext } from "@/features/workspaces/context";

import { DemoActionDisabledError } from "./assert-not-demo";
import { isLiveSandboxWorkspace } from "./sandbox-state";

export { getSandboxExpiry, isLiveSandboxWorkspace } from "./sandbox-state";

/**
 * Demo lockdown, sandbox-aware variant of assertNotDemo(). Use it on actions
 * that only change the caller's own workspace (career page, board copy, roles
 * and member access): a visitor's private sandbox may use them freely, while
 * the canonical template and every non-demo install keep their normal rules.
 * Identity, credential, integration and egress actions must keep the strict
 * assertNotDemo().
 */
export async function assertNotDemoOutsideSandbox(): Promise<void> {
  if (!isDemoMode()) return;
  const { organization: workspace } = await getWorkspaceContext();
  if (!(await isLiveSandboxWorkspace(workspace.id))) {
    throw new DemoActionDisabledError();
  }
}
