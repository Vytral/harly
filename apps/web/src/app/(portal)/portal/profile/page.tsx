import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import type { Route } from "next";

import { candidates, db } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { PortalShell } from "@/features/portal/PortalShell";
import { PortalProfileForm } from "@/features/portal/PortalProfileForm";

export const dynamic = "force-dynamic";

export default async function PortalProfilePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) redirect("/portal/login" as Route);

  const session = await resolvePortalSession(token);
  if (!session) redirect("/portal/login" as Route);

  const [candidate] = await db
    .select({
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      phone: candidates.phone,
      location: candidates.location,
      linkedinUrl: candidates.linkedinUrl,
      githubUrl: candidates.githubUrl,
      websiteUrl: candidates.websiteUrl,
      headline: candidates.headline,
    })
    .from(candidates)
    .where(eq(candidates.id, session.candidateId))
    .limit(1);

  if (!candidate) redirect("/portal/login" as Route);

  return (
    <PortalShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep your profile up to date — recruiters see this information with your applications.
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-6">
          <PortalProfileForm profile={candidate} />
        </div>
      </div>
    </PortalShell>
  );
}
