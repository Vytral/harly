import { getWorkspaceContext } from "@/features/workspaces/context";
import { getOwnProfileAction } from "@/features/people/actions";
import { getSecurityPasskeys } from "@/features/security/data";
import { PageTitle } from "@/components/dashboard/PageTitleContext";
import { AccountSettingsPanel } from "@/features/account/AccountSettingsPanel";
import { TwoFactorCard } from "@/features/security/TwoFactorCard";
import { PasskeysCard } from "@/features/security/PasskeysCard";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { user } = await getWorkspaceContext();
  const profile = await getOwnProfileAction();

  let userPasskeys: Awaited<ReturnType<typeof getSecurityPasskeys>> = [];
  try {
    userPasskeys = await getSecurityPasskeys(user.id);
  } catch {
    // passkeys table may not exist yet
  }

  const twoFactorEnabled =
    "twoFactorEnabled" in user && typeof user.twoFactorEnabled === "boolean"
      ? user.twoFactorEnabled
      : false;

  return (
    <div className="space-y-6">
      <PageTitle title="Account" />
      <AccountSettingsPanel
        user={{
          id: user.id,
          name: profile?.name ?? user.name,
          email: profile?.email ?? user.email,
          image: profile?.image ?? user.image ?? null,
          jobTitle: profile?.jobTitle ?? null,
          phone: profile?.phone ?? null,
          location: profile?.location ?? null,
          bio: profile?.bio ?? null,
          linkedinUrl: profile?.linkedinUrl ?? null,
          githubUrl: profile?.githubUrl ?? null,
          websiteUrl: profile?.websiteUrl ?? null,
          username: profile?.username ?? null,
          timezone: profile?.timezone ?? null,
          specialties: profile?.specialties ?? null,
          languages: profile?.languages ?? null,
          weeklyAvailability: profile?.weeklyAvailability ?? null,
          capacityHoursPerWeek: profile?.capacityHoursPerWeek ?? null,
          createdAt: (user as Record<string, unknown>).createdAt as Date | undefined,
        }}
        securitySlot={
          <>
            <TwoFactorCard enabled={twoFactorEnabled} />
            <PasskeysCard initialPasskeys={userPasskeys} />
          </>
        }
      />
    </div>
  );
}
