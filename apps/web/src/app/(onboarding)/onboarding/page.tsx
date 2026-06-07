import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { OnboardingWizard } from "./_components/OnboardingWizard";

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) redirect("/login");

  const context = await getWorkspaceContextOrNull({
    fallbackToFirstOrganization: false,
  });

  if (context) redirect("/dashboard");

  const firstName = session.user.name?.split(" ")[0] ?? "there";

  return <OnboardingWizard userName={firstName} />;
}
