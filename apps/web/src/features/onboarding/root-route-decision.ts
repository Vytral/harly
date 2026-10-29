/**
 * Where a signed-in visitor should land when they open `/`. Pure so the
 * decision is unit-tested without sessions or a database.
 *
 * `null` means "render the public page as before", which covers signed-out
 * visitors, demo visitors and accounts with no workspace that already finished
 * onboarding (redirecting those to /dashboard would loop back here).
 */
export type SignedInRootInput = {
  demo: boolean;
  signedIn: boolean;
  hasWorkspace: boolean;
  onboardingCompleted: boolean;
};

export type SignedInRootRoute = "/dashboard" | "/onboarding";

export function decideSignedInRootRoute(
  input: SignedInRootInput,
): SignedInRootRoute | null {
  if (input.demo || !input.signedIn) return null;

  if (!input.hasWorkspace) {
    return input.onboardingCompleted ? null : "/onboarding";
  }

  // Anyone who already belongs to a workspace goes straight to the app. The
  // onboarding flag is NOT consulted here: it was added later without a
  // backfill, so established users have it unset and would otherwise be sent
  // through the setup wizard after upgrading.
  return "/dashboard";
}
