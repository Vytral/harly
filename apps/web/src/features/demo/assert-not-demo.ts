import "server-only";

import { isDemoMode } from "@harly/config";

/**
 * Demo lockdown — Layer 2 (server-action guard).
 *
 * Better Auth's central hook (Layer 1) covers mutations that flow through the
 * `/api/auth/*` handler. But most of Harly's destructive identity/security
 * flows are plain Next.js server actions that hit the DB directly and never
 * pass through Better Auth — member/org management, forced password changes,
 * passkey deletion, SSO/SCIM/OAuth provider config, session revocation. Those
 * need their own guard.
 *
 * Call assertNotDemo() at the top of any server action that mutates state which
 * the 2-hourly reseed does NOT restore (anything on user/account/session/
 * member/organization or provider tables), so a shared-account visitor can't
 * leave the demo in a broken state that persists across resets.
 *
 * The decision is made on the server off DEMO_MODE only — never a client flag.
 * It throws a plain Error (matching requirePermission's "denied" convention),
 * which each action's existing try/catch turns into a controlled, generic
 * failure message without leaking internals.
 */
export class DemoActionDisabledError extends Error {
  readonly code = "DEMO_ACTION_DISABLED";
  constructor(message = "This action is disabled in the demo.") {
    super(message);
    this.name = "DemoActionDisabledError";
  }
}

/**
 * Throws in demo mode; no-op on normal installs. Pure decision helper below so
 * it can be unit-tested without the env.
 */
export function assertNotDemo(): void {
  if (isDemoMode()) {
    throw new DemoActionDisabledError();
  }
}

/**
 * Testable core: should this action be blocked given a demo-mode flag?
 * Exposed so tests don't have to mutate process.env.
 */
export function isDemoActionBlocked(demoMode: boolean): boolean {
  return demoMode === true;
}
