import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import type { Route } from "next";
import { getTranslations } from "next-intl/server";

import { candidates, db, organization, workspaceSettings } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { PortalShell } from "@/features/portal/PortalShellServer";
import { PortalEmptyState } from "@/features/portal/PortalEmptyState";
import { PortalProfileCompletionCard } from "@/features/portal/PortalProfileCompletionCard";
import { getPortalProfileCompletion } from "@/features/portal/profile-completion";
import { listPortalApplications } from "@/features/portal/applications-data";
import { PortalApplicationRow } from "@/features/portal/PortalApplicationRow";
import { BriefcaseIcon } from "@/components/ui/icons/phosphor";

export const dynamic = "force-dynamic";

export default async function PortalApplicationsPage() {
  const t = await getTranslations("pages.portalApplications.page");
  const token = (await cookies()).get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) redirect("/portal/login" as Route);

  const session = await resolvePortalSession(token);
  if (!session) redirect("/portal/login" as Route);

  const [[settings], [org], [candidate]] = await Promise.all([
    db
      .select({ showStatus: workspaceSettings.portalShowApplicationStatus })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, session.workspaceId))
      .limit(1),
    db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, session.workspaceId))
      .limit(1),
    db
      .select({
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        headline: candidates.headline,
        phone: candidates.phone,
        location: candidates.location,
        avatarUrl: candidates.avatarUrl,
        linkedinUrl: candidates.linkedinUrl,
        githubUrl: candidates.githubUrl,
        websiteUrl: candidates.websiteUrl,
      })
      .from(candidates)
      .where(and(eq(candidates.id, session.candidateId), eq(candidates.workspaceId, session.workspaceId), isNull(candidates.deletedAt)))
      .limit(1),
  ]);

  const showStages = settings?.showStatus !== false;
  const orgName = org?.name ?? t("companyFallback");
  const applications = await listPortalApplications({
    workspaceId: session.workspaceId,
    candidateId: session.candidateId,
    withStages: showStages,
  });
  const open = applications.filter((a) => a.status === "active");
  const closed = applications.filter((a) => a.status !== "active");

  return (
    <PortalShell>
      <div className="stagger-in mx-auto max-w-3xl space-y-6">
        <header className="pt-2">
          <h1 className="text-[28px] font-semibold tracking-tight text-near-ink">{t("title")}</h1>
          <p className="mt-1 text-[15px] text-soft-ink">{t("description")}</p>
        </header>

        {candidate ? <PortalProfileCompletionCard completion={getPortalProfileCompletion(candidate)} /> : null}

        {applications.length === 0 ? (
          <PortalEmptyState
            icon={BriefcaseIcon}
            title={t("emptyTitle")}
            description={t("emptyDescription", { orgName })}
            cta={{ label: t("browseRoles"), href: "/portal/jobs" as Route }}
          />
        ) : (
          <>
            {open.length > 0 ? (
              <section aria-labelledby="open-title" className="space-y-3">
                <h2 id="open-title" className="text-[13px] font-semibold uppercase tracking-wider text-soft-ink">
                  {t("openHeading", { count: open.length })}
                </h2>
                <ul className="space-y-2.5">
                  {open.map((application) => (
                    <PortalApplicationRow key={application.id} application={application} showStages={showStages} orgName={orgName} />
                  ))}
                </ul>
              </section>
            ) : null}
            {closed.length > 0 ? (
              <section aria-labelledby="closed-title" className="space-y-3">
                <h2 id="closed-title" className="text-[13px] font-semibold uppercase tracking-wider text-soft-ink">
                  {t("pastHeading", { count: closed.length })}
                </h2>
                <ul className="space-y-2.5">
                  {closed.map((application) => (
                    <PortalApplicationRow key={application.id} application={application} showStages={showStages} orgName={orgName} />
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </PortalShell>
  );
}
