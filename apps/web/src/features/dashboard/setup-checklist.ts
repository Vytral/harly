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
  /** Optional steps can be dismissed by the user instead of completed , not
   *  every workspace needs them (e.g. a solo recruiter working alone). */
  optional?: boolean;
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
        captchaEnabled: workspaceSettings.captchaEnabled,
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

  // Priority order: get a working, safe hiring pipeline live first (job,
  // email, anti-abuse captcha, careers page, legal), then the nice-to-haves
  // (branding, scheduling, other integrations), then team invites last , not
  // every workspace is more than one person, so that step is optional/dismissible.

  // 1. First job → swaps to reviewing applicants once they arrive.
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

  // 2. Email , recruiters can't run a pipeline without candidate email.
  push({
    key: "email",
    title: "Connect your email",
    value: "Send and track candidate emails from one inbox.",
    href: "/settings/integrations",
    done: Boolean(settings?.emailEnabled),
  });

  // 3. Captcha , protects the public application form from abuse/spam.
  push({
    key: "captcha",
    title: "Turn on captcha protection",
    value: "Stop bots and spam from flooding your application form.",
    href: "/settings/integrations",
    done: Boolean(settings?.captchaEnabled),
  });

  // 4. Careers page.
  push({
    key: "careers",
    title: "Customize your careers page",
    value: "Make your brand shine where candidates land.",
    href: "/dashboard/career-page",
    done: careersDone,
  });

  // 5. Legal , compliance is essential, not an afterthought.
  push({
    key: "legal",
    title: "Set up legal info",
    value: "Stay compliant. GDPR-ready in a few clicks.",
    href: "/settings/legal",
    done: Boolean(settings?.legalConfigured),
  });

  // 6. Logo , branding polish.
  push({
    key: "logo",
    title: "Add your logo",
    value: "Build trust with candidates from the first click.",
    href: "/settings",
    done: Boolean(context.organization.logo),
  });

  // 7. Company profile.
  push({
    key: "profile",
    title: "Complete your company profile",
    value: "Show candidates who you are and why to join.",
    href: "/settings",
    done: profileDone,
  });

  // 8. Scheduling , a separate critical step: an email integration alone
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

  // 9. Other integrations , only surfaced while nothing's connected.
  if (!hasIntegration) {
    push({
      key: "integrations",
      title: "Connect your tools",
      value: "Sync calendars and scheduling into your workflow.",
      href: "/settings/integrations",
      done: false,
    });
  }

  // 10. Invite the team , last, and dismissible: plenty of workspaces are a
  // single recruiter working alone or still evaluating Harly solo.
  push({
    key: "team",
    title: "Invite your team",
    value: "Hire together for faster, shared decisions.",
    href: "/settings/members",
    done: memberCount > 1 || inviteCount > 0,
    optional: true,
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
