import "server-only";

import { and, count, eq, isNull, sql } from "drizzle-orm";

import { db } from "@harly/db";
import {
  applications,
  invitation,
  jobs,
  member as authMembers,
  workspaceSettings,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { DEFAULT_BOARD_PRIMARY_COLOR } from "@/features/workspaces/board";

export type SetupChecklistItem = {
  key: string;
  /** Benefit-led title shown as the row heading. */
  title: string;
  /** One-line value proposition , answers "what do I get?". */
  value: string;
  href: string;
  done: boolean;
  /** CTA label: "Start" when pending, "Edit" once done (we keep it visible). */
  ctaLabel: string;
};

export type SetupChecklist = {
  items: SetupChecklistItem[];
  /** First undone item , powers the "recommended next step" hint. */
  nextStep: SetupChecklistItem | null;
  completed: number;
  total: number;
  percent: number;
  allDone: boolean;
  /** Owner/admin only , recruiters never see the checklist. */
  visible: boolean;
};

/**
 * Progressive "get your workspace ready" checklist for the dashboard.
 *
 * Reads existing workspace state and links to existing pages , it never owns
 * any setup itself. Kept deliberately cheap (four small aggregate queries), so
 * it can run on every dashboard render and in the sidebar layout without
 * pulling the heavy member/invite lists of getWorkspaceSettingsData.
 */
export async function getSetupChecklist(): Promise<SetupChecklist> {
  const context = await getWorkspaceContext();
  const workspaceId = context.organization.id;

  // Owner/admin gate , mirrors isOwnerRole in features/workspaces/actions.ts.
  const visible = context.role === "owner" || context.role === "admin";

  const [settingsRow, jobsAgg, membersRow, invitesRow] = await Promise.all([
    db
      .select({
        tagline: workspaceSettings.tagline,
        description: workspaceSettings.description,
        websiteUrl: workspaceSettings.websiteUrl,
        primaryColor: workspaceSettings.primaryColor,
        heroImageUrl: workspaceSettings.heroImageUrl,
        careerPageConfig: workspaceSettings.careerPageConfig,
        legalConfigured: workspaceSettings.legalConfigured,
        gcalEnabled: workspaceSettings.gcalEnabled,
        zoomEnabled: workspaceSettings.zoomEnabled,
        calEnabled: workspaceSettings.calEnabled,
        emailEnabled: workspaceSettings.emailEnabled,
        outlookEnabled: workspaceSettings.outlookEnabled,
        slackEnabled: workspaceSettings.slackEnabled,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, workspaceId))
      .limit(1),
    db
      .select({
        jobCount: sql<number>`count(distinct ${jobs.id})::int`,
        applicantCount: sql<number>`count(${applications.id})::int`,
      })
      .from(jobs)
      .leftJoin(
        applications,
        and(
          eq(applications.workspaceId, workspaceId),
          eq(applications.jobId, jobs.id),
        ),
      )
      .where(and(eq(jobs.workspaceId, workspaceId), isNull(jobs.deletedAt))),
    db
      .select({ value: count() })
      .from(authMembers)
      .where(eq(authMembers.organizationId, workspaceId)),
    db
      .select({ value: count() })
      .from(invitation)
      .where(eq(invitation.organizationId, workspaceId)),
  ]);

  const settings = settingsRow[0];
  const jobCount = jobsAgg[0]?.jobCount ?? 0;
  const applicantCount = jobsAgg[0]?.applicantCount ?? 0;
  const memberCount = membersRow[0]?.value ?? 0;
  const inviteCount = invitesRow[0]?.value ?? 0;

  const hasIntegration = Boolean(
    settings?.gcalEnabled ||
    settings?.zoomEnabled ||
    settings?.calEnabled ||
    settings?.emailEnabled ||
    settings?.outlookEnabled ||
    settings?.slackEnabled,
  );
  const hasCalendar = Boolean(
    settings?.gcalEnabled || settings?.zoomEnabled || settings?.calEnabled,
  );

  const hasJob = jobCount > 0;
  const hasApplicants = applicantCount > 0;

  // A company "profile" is done when they've given candidates something to see
  // beyond defaults , any of a tagline, an about description, a website, or a
  // brand colour they actually chose (≠ the board default). Existing/mature
  // workspaces rarely fill every field, so we treat these as OR, not AND.
  const hasCustomColor = Boolean(
    settings?.primaryColor &&
    settings.primaryColor.toLowerCase() !==
      DEFAULT_BOARD_PRIMARY_COLOR.toLowerCase(),
  );
  const profileDone = Boolean(
    settings?.tagline ||
    settings?.description ||
    settings?.websiteUrl ||
    hasCustomColor,
  );

  // Careers page is customised when they've edited its config away from the
  // empty default, or set a hero image / about copy.
  const careerConfig = settings?.careerPageConfig;
  const careersDone = Boolean(
    settings?.heroImageUrl ||
    settings?.description ||
    (careerConfig &&
      typeof careerConfig === "object" &&
      Object.keys(careerConfig).length > 0),
  );

  const items: SetupChecklistItem[] = [];

  const push = (
    item: Omit<SetupChecklistItem, "ctaLabel"> &
      Partial<Pick<SetupChecklistItem, "ctaLabel">>,
  ) =>
    items.push({
      ...item,
      ctaLabel: item.ctaLabel ?? (item.done ? "Edit" : "Start"),
    });

  // 1. Logo , trust first.
  push({
    key: "logo",
    title: "Add your logo",
    value: "Build trust with candidates from the first click.",
    href: "/settings",
    done: Boolean(context.organization.logo),
  });

  // 2. Company profile.
  push({
    key: "profile",
    title: "Complete your company profile",
    value: "Show candidates who you are and why to join.",
    href: "/settings",
    done: profileDone,
  });

  // 3. First job → swaps to reviewing applicants once they arrive.
  if (hasJob && hasApplicants) {
    push({
      key: "applicants",
      title: "Review your first applicants",
      value: "Candidates are waiting. Move them through your pipeline.",
      href: "/dashboard/candidates",
      done: true,
      ctaLabel: "Review",
    });
  } else {
    push({
      key: "job",
      title: "Publish your first job",
      value: "Start receiving applications today.",
      href: "/dashboard/jobs",
      done: hasJob,
    });
  }

  // 4. Careers page.
  push({
    key: "careers",
    title: "Customize your careers page",
    value: "Make your brand shine where candidates land.",
    href: "/dashboard/career-page",
    done: careersDone,
  });

  // 5. Invite the team.
  push({
    key: "team",
    title: "Invite your team",
    value: "Hire together for faster, shared decisions.",
    href: "/settings/members",
    done: memberCount > 1 || inviteCount > 0,
  });

  // 6. Scheduling is a separate critical step: an email integration alone
  // does not let a recruiter book interviews.
  if (!hasCalendar) {
    push({
      key: "scheduling",
      title: "Set up interview scheduling",
      value: "Let candidates book time without the back-and-forth.",
      href: "/settings/integrations",
      done: false,
    });
  }

  // 7. Other integrations , only surfaced while nothing's connected.
  if (!hasIntegration) {
    push({
      key: "integrations",
      title: "Connect your tools",
      value: "Sync calendars and scheduling into your workflow.",
      href: "/settings/integrations",
      done: false,
    });
  }

  // 8. Legal , last; important, but not what gets you hiring.
  push({
    key: "legal",
    title: "Set up legal info",
    value: "Stay compliant. GDPR-ready in a few clicks.",
    href: "/settings/legal",
    done: Boolean(settings?.legalConfigured),
  });

  const total = items.length;
  const completed = items.filter((i) => i.done).length;
  const percent = total === 0 ? 100 : Math.round((completed / total) * 100);
  const nextStep = items.find((i) => !i.done) ?? null;

  return {
    items,
    nextStep,
    completed,
    total,
    percent,
    allDone: completed === total,
    visible,
  };
}
