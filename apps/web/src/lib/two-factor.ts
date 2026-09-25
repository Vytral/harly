/**
 * Single source of truth for the workspace two-factor-authentication policy so
 * the middleware and every server action stay consistent. Pure (no db, no
 * server-only) so it can be imported anywhere, including edge middleware.
 */

/** No workspace role bypasses a mandatory 2FA policy. */
export function isExemptFrom2fa(roleKey: string | null | undefined): boolean {
  void roleKey;
  return false;
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
