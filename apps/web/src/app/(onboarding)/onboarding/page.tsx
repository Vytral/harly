import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

import { customRoles, db, passkeys, user as userTable, workspaceSettings } from "@harly/db";
import { auth } from "@/lib/auth";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { getWorkspaceSecuritySettings } from "@/features/security/data";
import { organizationExists } from "@/lib/self-host";
import { OwnerOnboarding } from "@/features/onboarding/OwnerOnboarding";
import { RecruiterOnboarding } from "@/features/onboarding/RecruiterOnboarding";

const BUILTIN_ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  recruiter: "Recruiter",
  hiring_manager: "Hiring Manager",
};

/** Human label for the role assigned at invite time, used to pre-fill "Your
 *  role" in onboarding. Falls back to the custom role's display name. */
async function resolveRoleLabel(
  workspaceId: string,
  roleKey: string,
): Promise<string | null> {
  const builtin = BUILTIN_ROLE_LABELS[roleKey];
  if (builtin) return builtin;

  const [customRole] = await db
    .select({ name: customRoles.name })
    .from(customRoles)
    .where(
      and(eq(customRoles.workspaceId, workspaceId), eq(customRoles.key, roleKey)),
    )
    .limit(1);
  return customRole?.name ?? null;
}

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const [userRow] = await db
    .select({
      onboardingCompletedAt: userTable.onboardingCompletedAt,
      twoFactorEnabled: userTable.twoFactorEnabled,
      image: userTable.image,
    })
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
    .limit(1);
  const onboardingCompletedAt = userRow?.onboardingCompletedAt ?? null;

  // Already onboarded → into the app.
  if (onboardingCompletedAt) redirect("/dashboard");

  const context = await getWorkspaceContextOrNull({
    fallbackToFirstOrganization: true,
  });

  const firstName = session.user.name?.split(" ")[0] ?? "there";

  // No membership yet.
  if (!context) {
    // A workspace exists but this account isn't in it → needs an invite.
    if (await organizationExists()) redirect("/no-workspace" as Route);
    // Fresh deployment → this user bootstraps the one workspace (becomes owner).
    return <OwnerOnboarding userName={firstName} />;
  }

  // Has a membership but hasn't finished setup.
  if (context.roleKey === "owner" || context.roleKey === "admin") {
    const [branding] = await db
      .select({
        tagline: workspaceSettings.tagline,
        primaryColor: workspaceSettings.primaryColor,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, context.organization.id))
      .limit(1);

    // Resume the owner setup against the workspace they already created.
    return (
      <OwnerOnboarding
        userName={firstName}
        initialOrg={{
          id: context.organization.id,
          name: context.organization.name,
          slug: context.organization.slug,
          logo: context.organization.logo,
          tagline: branding?.tagline ?? null,
          primaryColor: branding?.primaryColor ?? null,
        }}
      />
    );
  }

  // Recruiter / hiring manager, short personal onboarding that enforces the
  // workspace 2FA policy before they reach the dashboard.
  const security = await getWorkspaceSecuritySettings(context.organization.id);
  const suggestedRole = await resolveRoleLabel(
    context.organization.id,
    context.roleKey,
  );
  // A passkey is a valid second factor too, not just TOTP , otherwise
  // registering one during onboarding would never unlock the next step.
  const [existingPasskey] = await db
    .select({ id: passkeys.id })
    .from(passkeys)
    .where(eq(passkeys.userId, session.user.id))
    .limit(1);
  return (
    <RecruiterOnboarding
      userName={firstName}
      workspaceName={context.organization.name}
      require2fa={security.require2fa}
      twoFactorEnabled={Boolean(userRow?.twoFactorEnabled) || Boolean(existingPasskey)}
      suggestedRole={suggestedRole}
      initialAvatar={userRow?.image ?? null}
    />
  );
}
