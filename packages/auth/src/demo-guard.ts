import { APIError, createAuthMiddleware } from "better-auth/api";
import { isDemoMode } from "@harly/config";

/**
 * Demo lockdown — Layer 1 (central Better Auth guard).
 *
 * The public demo signs every visitor into ONE shared account, and the
 * workspace is wiped + reseeded every ~2 hours. The reseed only restores
 * product data scoped by workspace_id — it does NOT restore identity or
 * security state (password, email, 2FA, passkeys, sessions, org membership).
 *
 * So if the shared account could change its own password / email / 2FA, delete
 * the org, or leave the workspace, that change would PERSIST across resets and
 * could lock every future visitor out of the demo. This middleware rejects
 * those mutations at the Better Auth layer — on the server, keyed only off
 * DEMO_MODE — so no front-end condition or client call can reach them. Normal
 * installs are completely unaffected (the guard returns immediately unless
 * isDemoMode()).
 *
 * Paths here are Better Auth's plugin-relative paths (no `/api/auth` prefix),
 * matching ctx.path. Sign-out / get-session / set-active stay allowed so the
 * shared demo session can navigate. Credential sign-in is BLOCKED — the only
 * allowed entry is POST /api/demo/enter (Turnstile + server-minted session).
 */
export const DEMO_BLOCKED_AUTH_PATHS: readonly string[] = [
  // Enter-only: block password/social sign-in so Turnstile cannot be bypassed
  "/sign-in/email",
  "/sign-in/social",
  "/sign-in/email-otp",
  "/sign-in/username",
  "/sign-in/passkey",
  "/email-otp/send-verification-otp",
  "/forget-password",
  "/request-password-reset",
  "/reset-password",
  // Core account credentials + identity
  "/change-password",
  "/set-password",
  "/change-email",
  "/update-user",
  "/delete-user",
  // Two-factor (enabling it would gate every future visitor on a TOTP secret
  // they don't have; disabling/rotating is equally destructive to the shared
  // account state).
  "/two-factor/enable",
  "/two-factor/disable",
  "/two-factor/verify-totp",
  "/two-factor/verify-otp",
  "/two-factor/send-otp",
  "/two-factor/generate-backup-codes",
  "/two-factor/get-totp-uri",
  "/two-factor/verify-backup-code",
  // Session revocation (a visitor could otherwise sign out the shared account
  // everywhere; low blast radius since re-entry mints a fresh session, but
  // there's no reason to allow it).
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  // Organization / membership — none of these tables are reseeded, so any
  // change strands the single demo workspace.
  "/organization/delete",
  "/organization/update",
  "/organization/leave",
  "/organization/remove-member",
  "/organization/update-member-role",
  "/organization/invite-member",
  "/organization/cancel-invitation",
  "/organization/create-role",
  "/organization/update-role",
  "/organization/delete-role",
  // SSO connections (persist; not workspace-scoped in the reseed).
  "/sso/register",
  "/sso/update-provider",
  "/sso/delete-provider",
  "/sso/request-domain-verification",
  "/sso/verify-domain",
];

const blockedSet = new Set(DEMO_BLOCKED_AUTH_PATHS);

/**
 * Pure predicate: is this Better Auth path a demo-blocked mutation?
 * Kept separate from the middleware so it can be unit-tested without a full
 * request context.
 */
export function isDemoBlockedAuthPath(path: string | undefined | null): boolean {
  if (!path) return false;
  return blockedSet.has(path);
}

/**
 * Should the given path be rejected right now? Combines the demo-mode check
 * with the path predicate so both the middleware and tests share one decision.
 * `demoMode` is injectable for testing; defaults to the live env check.
 */
export function shouldBlockAuthPath(
  path: string | undefined | null,
  demoMode: boolean = isDemoMode(),
): boolean {
  if (!demoMode) return false;
  return isDemoBlockedAuthPath(path);
}

/**
 * Better Auth `hooks.before` middleware. Throws a controlled FORBIDDEN error
 * (no internal detail) for blocked identity/security mutations while the
 * instance runs as a demo. Off entirely on normal installs.
 */
export const demoGuardMiddleware = createAuthMiddleware(async (ctx) => {
  if (shouldBlockAuthPath(ctx.path)) {
    throw new APIError("FORBIDDEN", {
      message: "This action is disabled in the demo.",
    });
  }
});
