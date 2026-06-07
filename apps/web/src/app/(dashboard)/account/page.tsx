import { PageHeader } from "@/components/ui/PageHeader";
import { AccountSettingsPanel } from "@/features/account/AccountSettingsPanel";
import { getWorkspaceContext } from "@/features/workspaces/context";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { user } = await getWorkspaceContext();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Your account"
        description="Manage your personal profile, email, and password."
      />
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
          createdAt: (user as Record<string, unknown>).createdAt as Date | undefined,
        }}
      />
    </div>
  );
}
