import { getWorkspaceContext } from "@/features/workspaces/context";
import { getSecurityPasskeys } from "@/features/security/data";
import { PageTitle } from "@/components/dashboard/PageTitleContext";
import { AccountSettingsPanel } from "@/features/account/AccountSettingsPanel";
import { TwoFactorCard } from "@/features/security/TwoFactorCard";
import { PasskeysCard } from "@/features/security/PasskeysCard";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { user } = await getWorkspaceContext();

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
          name: user.name,
          email: user.email,
          image: user.image ?? null,
          jobTitle: (user as Record<string, unknown>).jobTitle as string | null ?? null,
          phone: (user as Record<string, unknown>).phone as string | null ?? null,
          location: (user as Record<string, unknown>).location as string | null ?? null,
          bio: (user as Record<string, unknown>).bio as string | null ?? null,
          linkedinUrl: (user as Record<string, unknown>).linkedinUrl as string | null ?? null,
          githubUrl: (user as Record<string, unknown>).githubUrl as string | null ?? null,
          websiteUrl: (user as Record<string, unknown>).websiteUrl as string | null ?? null,
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
