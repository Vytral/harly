import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, and, isNull } from "drizzle-orm";
import type { Route } from "next";
import { getTranslations } from "next-intl/server";

import { candidates, db, organization, workspaceSettings } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { PortalShell } from "@/features/portal/PortalShellServer";
import {
  getPortalApplicationInterviews,
  getPortalApplicationOffer,
} from "@/server/portal-applications";
import { listDocumentRequestsForPortal } from "@/features/documents/requests-data";
import { BriefcaseIcon, GlobeIcon, ArrowUpRightIcon, CaretRightIcon } from "@/components/ui/icons/phosphor";
import { PortalEmptyState } from "@/features/portal/PortalEmptyState";
import { PortalProfileCompletionCard } from "@/features/portal/PortalProfileCompletionCard";
import { getPortalProfileCompletion } from "@/features/portal/profile-completion";
import { listPortalApplications } from "@/features/portal/applications-data";
import { portalApplicationProgress } from "@/features/portal/application-progress";
import { PortalApplicationRow } from "@/features/portal/PortalApplicationRow";
import { PortalNextStep, type PortalNextStepData } from "@/features/portal/PortalNextStep";
import { formatEnumLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

/** How many active applications the dashboard inspects for pending actions. */
const ACTION_SCAN_LIMIT = 5;

export default async function PortalDashboardPage() {
  const t = await getTranslations("pages.portalDashboard.page");
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) redirect("/portal/login" as Route);

  const session = await resolvePortalSession(token);
  if (!session) redirect("/portal/login" as Route);

  const [[settings], [org], [candidate]] = await Promise.all([
    db
      .select({
        tagline: workspaceSettings.tagline,
        description: workspaceSettings.description,
        websiteUrl: workspaceSettings.websiteUrl,
        showStatus: workspaceSettings.portalShowApplicationStatus,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, session.workspaceId))
      .limit(1),
    db
      .select({ name: organization.name, logo: organization.logo })
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

  // Look for anything waiting on the candidate across their open applications.
  const active = applications.filter((a) => a.status === "active" || a.status === "hired").slice(0, ACTION_SCAN_LIMIT);
  const scans = await Promise.all(
    active.map(async (application) => {
      const [interviews, offer, requests] = await Promise.all([
        getPortalApplicationInterviews(application.id),
        getPortalApplicationOffer({
          applicationId: application.id,
          candidateId: session.candidateId,
          workspaceId: session.workspaceId,
        }),
        listDocumentRequestsForPortal({
          workspaceId: session.workspaceId,
          candidateId: session.candidateId,
          applicationId: application.id,
        }),
      ]);
      return { application, interviews, offer, requests };
    }),
  );

  const now = new Date();
  const nextStep = pickNextStep(scans, now);
  const primary = applications.find((a) => a.status === "active") ?? applications[0] ?? null;

  // Everyone the candidate has met or will meet, across open applications.
  const team = new Map<string, { name: string; image: string | null }>();
  for (const { interviews } of scans) {
    for (const iv of interviews) {
      if (iv.interviewerName && !team.has(iv.interviewerName)) {
        team.set(iv.interviewerName, { name: iv.interviewerName, image: iv.interviewerImage });
      }
    }
  }

  const tProgress = await getTranslations("labels.portal.applicationProgress");
  const waiting: PortalNextStepData | null = primary
    ? (() => {
        const progress = portalApplicationProgress({
          stages: primary.stages,
          currentStageId: primary.currentStageId,
          status: primary.status,
          showStages,
          orgName,
        }, tProgress);
        return {
          kind: "waiting",
          headline: primary.status === "active" ? t("waitingTitle") : progress.headline,
          body:
            primary.status === "active"
              ? progress.body
              : t("waitingBody", { jobTitle: primary.jobTitle, body: progress.body }),
        };
      })()
    : null;

  const firstName = session.firstName?.trim();
  const openCount = applications.filter((a) => a.status === "active").length;

  return (
    <PortalShell>
      <div className="stagger-in space-y-6">
        <header className="pt-2">
          <h1 className="text-[28px] font-semibold tracking-tight text-near-ink sm:text-[32px]">
            {firstName ? t("greeting", { firstName }) : t("welcomeBack")}
          </h1>
          <p className="mt-1 text-[15px] text-soft-ink">
            {applications.length === 0
              ? t("subtitleEmpty", { orgName })
              : openCount > 0
                ? t("subtitleOpen", { count: openCount, orgName })
                : t("subtitleClosed", { orgName })}
          </p>
        </header>

        {nextStep ?? waiting ? <PortalNextStep step={(nextStep ?? waiting)!} orgName={orgName} /> : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-labelledby="applications-title" className="min-w-0 space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="applications-title" className="text-[17px] font-semibold text-near-ink">
                {t("applicationsHeading")}
              </h2>
              {applications.length > 4 ? (
                <Link
                  href={"/portal/applications" as Route}
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-soft-ink hover:text-near-ink"
                >
                  {t("viewAll", { count: applications.length })}
                  <CaretRightIcon className="size-3.5" />
                </Link>
              ) : null}
            </div>
            {applications.length === 0 ? (
              <PortalEmptyState
                icon={BriefcaseIcon}
                title={t("emptyTitle")}
                description={t("emptyDescription", { orgName })}
                cta={{ label: t("browseRoles"), href: "/portal/jobs" as Route }}
              />
            ) : (
              <ul className="stagger-in space-y-2.5">
                {applications.slice(0, 4).map((application) => (
                  <PortalApplicationRow
                    key={application.id}
                    application={application}
                    showStages={showStages}
                    orgName={orgName}
                  />
                ))}
              </ul>
            )}
          </section>

          <aside className="space-y-4">
            {candidate ? <PortalProfileCompletionCard completion={getPortalProfileCompletion(candidate)} /> : null}

            <section className="rounded-2xl border border-hairline bg-card p-5">
              <div className="flex items-center gap-3">
                {org?.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- workspace logo
                  <img src={org.logo} alt="" className="size-10 rounded-xl object-cover" />
                ) : (
                  <span className="grid size-10 place-items-center rounded-xl bg-card-inset text-[15px] font-semibold text-near-ink">
                    {orgName.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-near-ink">{orgName}</p>
                  {settings?.tagline ? <p className="truncate text-[12.5px] text-soft-ink">{settings.tagline}</p> : null}
                </div>
              </div>
              {settings?.description ? (
                <p className="mt-3 line-clamp-4 text-[13.5px] leading-5 text-soft-ink">{settings.description}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[13px] font-medium">
                <Link href={"/portal/jobs" as Route} className="inline-flex items-center gap-1 text-near-ink hover:underline underline-offset-2">
                  {t("openRoles")}
                  <CaretRightIcon className="size-3.5" />
                </Link>
                {settings?.websiteUrl ? (
                  <a
                    href={settings.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-soft-ink hover:text-near-ink"
                  >
                    <GlobeIcon className="size-3.5" />
                    {t("website")}
                    <ArrowUpRightIcon className="size-3" />
                  </a>
                ) : null}
              </div>
            </section>

            {team.size > 0 ? (
              <section className="rounded-2xl border border-hairline bg-card p-5">
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-soft-ink">{t("hiringTeam")}</h2>
                <ul className="mt-3 space-y-3">
                  {[...team.values()].slice(0, 6).map((member) => (
                    <li key={member.name} className="flex items-center gap-3">
                      {member.image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- workspace user avatar
                        <img src={member.image} alt="" className="size-8 rounded-full object-cover" />
                      ) : (
                        <span className="grid size-8 place-items-center rounded-full bg-card-inset text-[12px] font-semibold text-soft-ink">
                          {member.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium text-near-ink">{member.name}</p>
                        <p className="text-[12px] text-soft-ink">{t("interviewer")}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </PortalShell>
  );
}

type Scan = {
  application: { id: string; jobTitle: string };
  interviews: Awaited<ReturnType<typeof getPortalApplicationInterviews>>;
  offer: Awaited<ReturnType<typeof getPortalApplicationOffer>>;
  requests: Awaited<ReturnType<typeof listDocumentRequestsForPortal>>;
};

/** Priority: an offer to sign, then documents to upload, then the soonest interview. */
function pickNextStep(scans: Scan[], now: Date): PortalNextStepData | null {
  for (const { application, offer } of scans) {
    if (offer?.status === "sent" && !(offer.expiresAt && offer.expiresAt <= now)) {
      return { kind: "offer", applicationId: application.id, jobTitle: application.jobTitle, offerTitle: offer.title };
    }
  }
  for (const { application, requests } of scans) {
    const open = requests.filter((r) => r.status === "pending" || r.status === "declined").length;
    if (open > 0) return { kind: "documents", applicationId: application.id, jobTitle: application.jobTitle, count: open };
  }
  let soonest: { scan: Scan; interview: Scan["interviews"][number] } | null = null;
  for (const scan of scans) {
    for (const interview of scan.interviews) {
      if (interview.status !== "scheduled" || interview.scheduledAt <= now) continue;
      if (!soonest || interview.scheduledAt < soonest.interview.scheduledAt) soonest = { scan, interview };
    }
  }
  if (!soonest) return null;
  const { scan, interview } = soonest;
  return {
    kind: "interview",
    applicationId: scan.application.id,
    jobTitle: scan.application.jobTitle,
    interview: { ...interview, title: interview.title ?? formatEnumLabel(interview.type) },
  };
}
