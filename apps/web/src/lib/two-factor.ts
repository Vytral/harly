/**
 * Single source of truth for the workspace two-factor-authentication policy so
 * the middleware and every server action stay consistent. Pure (no db, no
 * server-only) so it can be imported anywhere, including edge middleware.
 */

/**
 * Roles exempt from 2FA enforcement. Owner is exempt (temporary , for testing):
 * the keyholder can always reach the workspace without a second factor.
 */
export function isExemptFrom2fa(roleKey: string | null | undefined): boolean {
  return roleKey === "owner";
}

/**
 * Decide whether a user still has to set up 2FA before proceeding, given the
 * workspace policy, the user's current 2FA state, and their role. Enforcement
 * only kicks in when the workspace requires it, the user hasn't enabled it, and
 * the user isn't exempt.
 */
export function mustSetUp2fa(params: {
  workspaceRequires2fa: boolean;
  userHas2fa: boolean;
  roleKey: string | null | undefined;
}): boolean {
  const { workspaceRequires2fa, userHas2fa, roleKey } = params;
  if (!workspaceRequires2fa) return false;
  if (userHas2fa) return false;
  return !isExemptFrom2fa(roleKey);
}
