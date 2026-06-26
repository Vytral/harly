import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import type { Route } from "next";

import { candidates, db } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { PortalShell } from "@/features/portal/PortalShellServer";
import { PortalProfileForm } from "@/features/portal/PortalProfileForm";
import { CandidateAvatarEdit } from "@/features/candidates/CandidateAvatarEdit";

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
      avatarUrl: candidates.avatarUrl,
    })
    .from(candidates)
    .where(eq(candidates.id, session.candidateId))
    .limit(1);

  if (!candidate) redirect("/portal/login" as Route);

  const fullName = `${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`.trim();

  return (
    <PortalShell>
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Avatar + name header */}
        <div className="flex items-center gap-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-900">
          <CandidateAvatarEdit
            candidateId={session.candidateId}
            workspaceId={session.workspaceId}
            name={fullName}
            avatarUrl={candidate.avatarUrl}
            className="size-16"
          />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-foreground">{fullName}</h1>
            {candidate.headline && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{candidate.headline}</p>
            )}
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{candidate.email}</p>
          </div>
        </div>

        {/* Edit form */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-5 text-sm font-semibold text-foreground">Edit profile</h2>
          <PortalProfileForm profile={candidate} />
        </div>
      </div>
    </PortalShell>
  );
}
