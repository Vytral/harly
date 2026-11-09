"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getTranslations } from "@/i18n/server";

import { db } from "@harly/db";
import {
  activityEvents,
  applications,
  candidatePortalNotifications,
  candidateFiles,
  candidates,
  interviews,
  jobs,
  organization,
  user as authUsers,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { getInboundReplyTo } from "@/lib/email/inbound-token";
import {
  formatInterviewWhen as formatInterviewWhenText,
} from "@/lib/email/interview-time";
import {
  queueInterviewEmail,
  resolveInterviewEmailZoneFor,
  type InterviewEmailQueueResult,
} from "@/features/interviews/email-queue";
import {
  syncInterviewToGCal,
  cancelInterviewGCalEvent,
  updateInterviewGCalEvent,
} from "@/lib/gcal/sync";
import { getWorkspaceGCalConfig } from "@/lib/gcal/config";
import {
  syncInterviewToTeams,
  cancelInterviewTeamsMeeting,
  replaceInterviewToTeams,
} from "@/lib/outlook/teams-sync";
import { getWorkspaceOutlookConfig } from "@/lib/outlook/config";
import {
  syncInterviewToZoom,
  cancelInterviewZoomMeeting,
  replaceInterviewToZoom,
} from "@/lib/zoom/sync";
import {
  syncInterviewToJitsi,
  cancelInterviewJitsiMeeting,
} from "@/lib/jitsi/sync";
import { getWorkspaceJitsiConfig } from "@/lib/jitsi/config";
import { getZoomToken } from "@/lib/zoom/config";
import { trackInterviewSync } from "@/lib/interviews/sync-ledger";
import { emitWebhookEvent } from "@/server/webhooks/emit";
import {
  persistDomainEvent,
  publishPersistedDomainEvents,
  type PersistedDomainEvent,
} from "@/server/events/emit";
import {
  requireApplicationPermission,
  requireInterviewPermission,
} from "@/features/workspaces/permissions-server";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { generateInterviewBriefWithAI } from "@/lib/ai/surfaces/generate-interview-brief";
import { summarizeInterviewNotesWithAI } from "@/lib/ai/surfaces/summarize-interview-notes";
import type { InterviewBrief, InterviewNotesSummary } from "@/lib/ai/schemas";
import { createLogger } from "@/lib/logger";
import {
  deriveMeetLink,
  interviewModeTitle,
  interviewTypeTitle,
  NonexistentLocalTimeError,
  parseScheduledAt,
} from "@/features/interviews/shared";
import { extractResumeText } from "@/lib/resume/extract-text";
import { resumeKeyFromUrl } from "@/lib/resume/storage-key";
import { storage } from "@/lib/storage";
import { maxResumeFileSize } from "@/lib/storage-validation";
import { findWorkspaceMember } from "./core";
import { lockInterviewerSchedule } from "./booking-lock";
import { serializeInterview } from "./service";

const log = createLogger("interviews");

type Translate = Awaited<ReturnType<typeof getTranslations>>;


async function isWorkspaceMember(workspaceId: string, userId: string) {
  const membership = await findWorkspaceMember(workspaceId, userId);
  return Boolean(membership);
}

/** A scheduled interview time must be in the future. Past times produce a
 *  "scheduled" row the candidate gets an email for but that never surfaces in
 *  the upcoming list (which filters gte(now)), so the recruiter loses it. */
function isPastWhen(when: Date): boolean {
  return when.getTime() < Date.now();
}

type QueryExecutor = Pick<typeof db, "select">;

/** Find a scheduled interview that overlaps `[when, when + durationMins]` for
 *  the given interviewer, optionally excluding one interview (self, on edits).
 *  Returns true when a conflict exists. Shared by schedule/reschedule/update so
 *  the overlap check can't drift between them (reschedule/update previously
 *  skipped it entirely). */
async function hasInterviewerConflict(
  executor: QueryExecutor,
  input: {
    workspaceId: string;
    interviewerId: string;
    when: Date;
    durationMins: number;
    excludeInterviewId?: string;
  },
): Promise<boolean> {
  const conditions = [
    eq(interviews.workspaceId, input.workspaceId),
    eq(interviews.interviewerId, input.interviewerId),
    eq(interviews.status, "scheduled"),
    sql`${interviews.scheduledAt} < ${new Date(input.when.getTime() + input.durationMins * 60_000).toISOString()}`,
    sql`${interviews.scheduledAt} + (${interviews.durationMins} * interval '1 minute') > ${input.when.toISOString()}`,
  ];
  if (input.excludeInterviewId) {
    conditions.push(ne(interviews.id, input.excludeInterviewId));
  }
  const [conflict] = await executor
    .select({ id: interviews.id })
    .from(interviews)
    .where(and(...conditions))
    .limit(1);
  return Boolean(conflict);
}

function formatInterviewWhen(when: Date, timeZone?: string | null): string {
  return formatInterviewWhenText(when, timeZone);
}

/**
 * Parse a scheduling time for an action result. A time the zone skips is a
 * validation error for the recruiter, not a silent shift.
 */
function parseInterviewTime(
  t: Translate,
  value: string,
  timeZone: string | null | undefined,
): { ok: true; when: Date } | { ok: false; error: string } {
  try {
    return { ok: true, when: parseScheduledAt(value, timeZone) };
  } catch (error) {
    if (error instanceof NonexistentLocalTimeError) {
      return {
        ok: false,
        error: t("nonexistentTime", { timeZone: timeZone ?? "" }),
      };
    }
    throw error;
  }
}

const interviewTypes = [
  "screening",
  "culture_fit",
  "technical",
  "onsite",
  "final",
] as const;
const interviewModes = ["video", "phone", "onsite"] as const;
const meetingProviders = [
  "auto",
  "google_meet",
  "zoom",
  "teams",
  "jitsi",
  "external",
] as const;
type MeetingProvider = (typeof meetingProviders)[number];

function buildScheduleSchema(t: Translate) {
  return z.object({
  workspaceId: z.string().min(1),
  candidateId: z.string().min(1),
  applicationId: z
    .string()
    .min(1, t("pickApplication")),
  type: z.enum(interviewTypes),
  mode: z.enum(interviewModes),
  // Local datetime-string from the form (YYYY-MM-DDTHH:mm). Parsed to a Date below.
  scheduledAt: z
    .string()
    .min(1, t("pickDateTime"))
    .refine((value) => !Number.isNaN(Date.parse(value)), t("invalidDateTime")),
  timeZone: z
    .string()
    .trim()
    .max(80)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    }, t("invalidTimezone"))
    .nullable()
    .optional(),
  durationMins: z.coerce.number().int().min(5).max(480).default(45),
  interviewerId: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .optional(),
  title: z
    .string()
    .trim()
    .max(120)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .optional(),
  location: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .optional(),
  notes: z
    .string()
    .trim()
    .max(5000)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .optional(),
  meetingProvider: z.enum(meetingProviders).default("auto"),
  sendEmail: z.boolean().default(true),
  });
}

export type InterviewEmailStatus = "sent" | "failed" | "skipped";

export type ScheduleInterviewInput = {
  workspaceId: string;
  candidateId: string;
  applicationId: string;
  type: (typeof interviewTypes)[number];
  mode: (typeof interviewModes)[number];
  scheduledAt: string;
  durationMins: number;
  interviewerId?: string | null;
  title?: string | null;
  location?: string | null;
  notes?: string | null;
  meetingProvider?: MeetingProvider | null;
  timeZone?: string | null;
  sendEmail?: boolean;
};

/**
 * Create a real interview row (not a fake note). Resolves the job from the
 * application, writes the interview, and logs an activity event so it surfaces
 * in the candidate timeline and the dashboard agenda.
 */
export async function scheduleInterview(
  input: ScheduleInterviewInput,
): Promise<{
  success: boolean;
  error?: string;
  warning?: string;
  emailStatus?: InterviewEmailStatus;
  /** Accurate, non-blocking email copy; `warning` also carries it for older callers. */
  emailWarning?: string;
  interviewId?: string;
}> {
  const t = await getTranslations("server.interviews.actions");
  const tl = await getTranslations("labels.interviews");
  try {
    const parsed = buildScheduleSchema(t).safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? t("invalidInterview"),
      };
    }

    const { organization: workspace, user } = await getWorkspaceContext();
    if (workspace.id !== parsed.data.workspaceId) {
      return { success: false, error: t("workspaceAccessDenied") };
    }

    await requireApplicationPermission(
      "interviews:manage",
      parsed.data.applicationId,
    );

    const data = parsed.data;
    const parsedWhen = parseInterviewTime(t, data.scheduledAt, data.timeZone);
    if (!parsedWhen.ok) return { success: false, error: parsedWhen.error };
    const when = parsedWhen.when;

    if (isPastWhen(when)) {
      return {
        success: false,
        error: t("timeInPast"),
      };
    }

    if (
      data.interviewerId &&
      !(await isWorkspaceMember(workspace.id, data.interviewerId))
    ) {
      return {
        success: false,
        error: t("interviewerNotInWorkspace"),
      };
    }

    // The in-app confirmation and the candidate email show the same zone.
    const displayZone = await resolveInterviewEmailZoneFor({
      workspaceId: workspace.id,
      kind: "interview.scheduled",
      requested: data.timeZone ?? null,
      actorId: user.id,
    });
    const scheduledEvent: { current: PersistedDomainEvent | null } = {
      current: null,
    };
    const result = await db.transaction(async (tx) => {
      // The application is the anchor: it ties the interview to a candidate AND a job.
      const [application] = await tx
        .select({ id: applications.id, jobId: applications.jobId })
        .from(applications)
        .innerJoin(
          candidates,
          and(
            eq(candidates.id, applications.candidateId),
            eq(candidates.workspaceId, workspace.id),
            isNull(candidates.deletedAt),
          ),
        )
        .innerJoin(
          jobs,
          and(
            eq(jobs.id, applications.jobId),
            eq(jobs.workspaceId, workspace.id),
            isNull(jobs.deletedAt),
          ),
        )
        .where(
          and(
            eq(applications.id, data.applicationId),
            eq(applications.workspaceId, workspace.id),
            eq(applications.candidateId, data.candidateId),
          ),
        )
        .limit(1);

      if (!application) {
        return { success: false as const, error: t("applicationNotFound") };
      }

      if (data.interviewerId) {
        await lockInterviewerSchedule(tx, workspace.id, data.interviewerId);
        const conflict = await hasInterviewerConflict(tx, {
          workspaceId: workspace.id,
          interviewerId: data.interviewerId,
          when,
          durationMins: data.durationMins,
        });
        if (conflict) {
          return {
            success: false as const,
            error: t("interviewerConflict"),
          };
        }
      }

      const [interview] = await tx
        .insert(interviews)
        .values({
          workspaceId: workspace.id,
          applicationId: application.id,
          jobId: application.jobId,
          candidateId: data.candidateId,
          interviewerId: data.interviewerId ?? null,
          title: data.title ?? null,
          type: data.type,
          mode: data.mode,
          status: "scheduled",
          scheduledAt: when,
          durationMins: data.durationMins,
          location: data.location ?? null,
          meetLink: deriveMeetLink(data.mode, data.location),
          notes: data.notes ?? null,
        })
        .returning({ id: interviews.id, updatedAt: interviews.updatedAt });

      if (!interview) {
        throw new Error("Interview could not be created.");
      }

      await tx.insert(activityEvents).values({
        workspaceId: workspace.id,
        actorId: user.id,
        entityType: "application",
        entityId: application.id,
        type: "interview.scheduled",
        metadata: {
          interviewId: interview.id,
          type: data.type,
          mode: data.mode,
          scheduledAt: when.toISOString(),
        },
      });

      await tx.insert(candidatePortalNotifications).values({
        workspaceId: workspace.id,
        candidateId: data.candidateId,
        type: "interview_scheduled",
        title: t("scheduledTitle"),
        body: t("scheduledBody", { when: formatInterviewWhen(when, displayZone) }),
        href: `/portal/applications/${application.id}`,
        metadata: { interviewId: interview.id, applicationId: application.id },
      });

      scheduledEvent.current = await persistDomainEvent(tx, {
        name: "interview.scheduled",
        workspaceId: workspace.id,
        actorId: user.id,
        aggregateType: "interview",
        aggregateId: interview.id,
        payload: {
          interview: {
            id: interview.id,
            applicationId: application.id,
            candidateId: data.candidateId,
            jobId: application.jobId,
            type: data.type,
            mode: data.mode,
            scheduledAt: when.toISOString(),
            durationMins: data.durationMins,
            location: data.location ?? null,
          },
        },
      });

      return {
        success: true as const,
        interviewId: interview.id,
        revision: interview.updatedAt.getTime(),
      };
    });

    let warning: string | undefined;
    let emailStatus: InterviewEmailStatus | undefined;
    let emailWarning: string | undefined;
    if (result.success) {
      if (scheduledEvent.current) {
        await publishPersistedDomainEvents([scheduledEvent.current]);
      }
      emailStatus = "skipped";
      // Resolve participant emails for GCal attendees + candidate notification.
      const [recipient] = await db
        .select({
          email: candidates.email,
          firstName: candidates.firstName,
          lastName: candidates.lastName,
          companyName: organization.name,
          jobTitle: jobs.title,
        })
        .from(applications)
        .innerJoin(
          candidates,
          and(
            eq(candidates.id, applications.candidateId),
            eq(candidates.workspaceId, workspace.id),
            isNull(candidates.deletedAt),
          ),
        )
        .innerJoin(
          jobs,
          and(
            eq(jobs.id, applications.jobId),
            eq(jobs.workspaceId, workspace.id),
            isNull(jobs.deletedAt),
          ),
        )
        .innerJoin(organization, eq(organization.id, applications.workspaceId))
        .where(
          and(
            eq(applications.id, data.applicationId),
            eq(applications.workspaceId, workspace.id),
          ),
        )
        .limit(1);

      let interviewerEmail: string | undefined;
      let interviewerName: string | undefined;
      if (data.interviewerId) {
        const [interviewer] = await db
          .select({ email: authUsers.email, name: authUsers.name })
          .from(authUsers)
          .where(eq(authUsers.id, data.interviewerId))
          .limit(1);
        interviewerEmail = interviewer?.email ?? undefined;
        interviewerName = interviewer?.name ?? undefined;
      }

      const attendees = [recipient?.email, interviewerEmail].filter(
        (e): e is string => Boolean(e),
      );

      const summary =
        data.title ?? interviewTypeTitle(tl, data.type);
      const warnings: string[] = [];
      let deliveryLocation = data.location ?? undefined;
      const provider = data.meetingProvider ?? "auto";
      const hasExplicitMeetingLink =
        deriveMeetLink(data.mode, data.location) !== null;
      const addCalendarSyncWarning = (
        reason: "not_connected" | "invalid_grant" | "failed",
      ) => {
        warnings.push(
          reason === "invalid_grant"
            ? t("gcalNeedsReconnect")
            : reason === "not_connected"
              ? t("gcalNotConnected")
              : t("gcalUpdateFailed"),
        );
      };
      const syncCalendar = async (conferenceData: boolean) => {
        const syncResult = await trackInterviewSync({
          workspaceId: workspace.id,
          interviewId: result.interviewId,
          provider: "google_calendar",
          operation: "upsert",
          run: () =>
            syncInterviewToGCal({
              workspaceId: workspace.id,
              interviewId: result.interviewId,
              summary,
              description: data.notes ?? undefined,
              start: when,
              durationMins: data.durationMins,
              attendees: attendees.length > 0 ? attendees : undefined,
              location: data.location ?? undefined,
              mode: conferenceData ? "video" : undefined,
              timeZone: data.timeZone ?? "UTC",
            }),
          isSuccess: (providerResult) => providerResult.ok,
          resourceId: (providerResult) =>
            providerResult.ok ? providerResult.eventId : undefined,
          resourceUrl: (providerResult) =>
            providerResult.ok ? providerResult.meetLink : undefined,
        });
        if (syncResult && !syncResult.ok) {
          addCalendarSyncWarning(syncResult.reason);
        }
        return syncResult;
      };
      if (data.mode === "video") {
        // A video interview gets exactly one provider. Priority is explicit and
        // stable: Zoom, then Teams, then Google Meet, then Jitsi. Await its
        // persistence so the candidate receives the same link Harly stores on
        // the interview.
        const [zoomToken, outlookConfig, gcalConfig, jitsiConfig] =
          await Promise.all([
            getZoomToken(workspace.id),
            getWorkspaceOutlookConfig(workspace.id),
            getWorkspaceGCalConfig(workspace.id),
            getWorkspaceJitsiConfig(workspace.id),
          ]);
        if (hasExplicitMeetingLink || provider === "external") {
          if (!data.location) {
            warnings.push(
              t("externalLinkNeeded"),
            );
          } else {
            await syncCalendar(false);
          }
        } else if (provider === "google_meet") {
          await syncCalendar(true);
        } else if (provider === "zoom") {
          if (!zoomToken) {
            warnings.push(
              t("zoomNotConnected"),
            );
          } else if (
            !(await trackInterviewSync({
              workspaceId: workspace.id,
              interviewId: result.interviewId,
              provider: "zoom",
              operation: "upsert",
              run: () =>
                syncInterviewToZoom({
                  workspaceId: workspace.id,
                  interviewId: result.interviewId,
                  summary,
                  start: when,
                  durationMins: data.durationMins,
                }),
              isSuccess: Boolean,
              resourceId: (providerResult) => providerResult?.meetingId,
              resourceUrl: (providerResult) => providerResult?.joinUrl,
            }))
          ) {
            warnings.push(
              t("zoomCreateFailed"),
            );
          }
        } else if (provider === "teams") {
          if (!outlookConfig) {
            warnings.push(
              t("teamsNotConnected"),
            );
          } else {
            const teamsResult = await trackInterviewSync({
              workspaceId: workspace.id,
              interviewId: result.interviewId,
              provider: "microsoft_teams",
              operation: "upsert",
              run: () =>
                syncInterviewToTeams({
                  workspaceId: workspace.id,
                  interviewId: result.interviewId,
                  summary,
                  start: when,
                  durationMins: data.durationMins,
                }),
              isSuccess: Boolean,
              resourceId: (providerResult) => providerResult?.meetingId,
              resourceUrl: (providerResult) => providerResult?.joinUrl,
            });
            if (!teamsResult) {
              warnings.push(
                t("teamsCreateFailed"),
              );
            }
          }
        } else if (provider === "jitsi") {
          if (!jitsiConfig) {
            warnings.push(
              t("jitsiNotConnected"),
            );
          } else {
            const jitsiResult = await trackInterviewSync({
              workspaceId: workspace.id,
              interviewId: result.interviewId,
              provider: "jitsi",
              operation: "upsert",
              run: () =>
                syncInterviewToJitsi({
                  workspaceId: workspace.id,
                  interviewId: result.interviewId,
                }),
              isSuccess: Boolean,
              resourceId: (providerResult) => providerResult?.room,
              resourceUrl: (providerResult) => providerResult?.joinUrl,
            });
            if (!jitsiResult) {
              warnings.push(
                t("jitsiCreateFailed"),
              );
            }
          }
        } else if (zoomToken) {
          const zoomResult = await trackInterviewSync({
            workspaceId: workspace.id,
            interviewId: result.interviewId,
            provider: "zoom",
            operation: "upsert",
            run: () =>
              syncInterviewToZoom({
                workspaceId: workspace.id,
                interviewId: result.interviewId,
                summary,
                start: when,
                durationMins: data.durationMins,
              }),
            isSuccess: Boolean,
            resourceId: (providerResult) => providerResult?.meetingId,
            resourceUrl: (providerResult) => providerResult?.joinUrl,
          });
          if (!zoomResult) {
            warnings.push(
              t("zoomCreateFailed"),
            );
          }
        } else if (outlookConfig) {
          const teamsResult = await trackInterviewSync({
            workspaceId: workspace.id,
            interviewId: result.interviewId,
            provider: "microsoft_teams",
            operation: "upsert",
            run: () =>
              syncInterviewToTeams({
                workspaceId: workspace.id,
                interviewId: result.interviewId,
                summary,
                start: when,
                durationMins: data.durationMins,
              }),
            isSuccess: Boolean,
            resourceId: (providerResult) => providerResult?.meetingId,
            resourceUrl: (providerResult) => providerResult?.joinUrl,
          });
          if (!teamsResult) {
            warnings.push(
              t("teamsCreateFailed"),
            );
          }
        } else if (gcalConfig) {
          await syncCalendar(true);
        } else if (jitsiConfig) {
          const jitsiResult = await trackInterviewSync({
            workspaceId: workspace.id,
            interviewId: result.interviewId,
            provider: "jitsi",
            operation: "upsert",
            run: () =>
              syncInterviewToJitsi({
                workspaceId: workspace.id,
                interviewId: result.interviewId,
              }),
            isSuccess: Boolean,
            resourceId: (providerResult) => providerResult?.room,
            resourceUrl: (providerResult) => providerResult?.joinUrl,
          });
          if (!jitsiResult) {
            warnings.push(
              t("jitsiCreateFailed"),
            );
          }
        }
        const [synced] = await db
          .select({ meetLink: interviews.meetLink })
          .from(interviews)
          .where(
            and(
              eq(interviews.id, result.interviewId),
              eq(interviews.workspaceId, workspace.id),
            ),
          )
          .limit(1);
        deliveryLocation = synced?.meetLink ?? deliveryLocation;
        if (!deliveryLocation && warnings.length === 0) {
          warnings.push(
            t("noVideoLink"),
          );
        }
      } else {
        await syncCalendar(false);
      }

      if (data.sendEmail && recipient?.email) {
        const replyTo = await getInboundReplyTo(
          workspace.id,
          data.applicationId,
        );
        const queuedEmail: InterviewEmailQueueResult = await queueInterviewEmail(
          workspace.id,
          "interview.scheduled",
          {
            interviewId: result.interviewId,
            revision: result.revision,
            candidateEmail: recipient.email,
            candidateName: `${recipient.firstName} ${recipient.lastName}`,
            companyName: recipient.companyName,
            jobTitle: recipient.jobTitle,
            interviewType: interviewTypeTitle(tl, data.type),
            scheduledAt: when.toISOString(),
            timeZone: data.timeZone ?? null,
            mode: interviewModeTitle(tl, data.mode),
            location: deliveryLocation,
            durationMins: data.durationMins,
            notes: data.notes ?? undefined,
            replyTo,
            interviewerName,
          },
          user.id,
          displayZone,
          t,
        );
        emailStatus = queuedEmail.status;
        emailWarning = queuedEmail.warning;
        if (queuedEmail.warning) {
          warnings.push(t("scheduledWithWarning", { warning: queuedEmail.warning }));
        }
      } else if (data.sendEmail) {
        emailStatus = "failed";
        warnings.push(
          t("noCandidateEmail"),
        );
      }

      revalidatePath(`/dashboard/candidates/${data.candidateId}`);
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/calendars");

      // Emit outbound webhook event.
      void emitWebhookEvent(workspace.id, "interview.scheduled", {
        interview: {
          id: result.interviewId,
          candidateId: data.candidateId,
          applicationId: data.applicationId,
          type: data.type,
          mode: data.mode,
          scheduledAt: when.toISOString(),
          durationMins: data.durationMins,
          location: data.location ?? null,
          interviewerId: data.interviewerId ?? null,
        },
        eventId: scheduledEvent.current?.eventId,
      }, { actorId: user.id, skipDomainEvent: true, eventId: scheduledEvent.current?.eventId });
      warning =
        warnings.length > 0 ? [...new Set(warnings)].join(" ") : undefined;
    }

    return {
      ...result,
      ...(emailStatus ? { emailStatus } : {}),
      ...(emailWarning ? { emailWarning } : {}),
      ...(warning ? { warning } : {}),
    };
  } catch (error) {
    log.error(error, "scheduleInterview failed");
    return {
      success: false,
      error: t("unableToSchedule"),
    };
  }
}

const statusSchema = z.object({
  interviewId: z.string().min(1),
  // Kept optional for backwards-compatible callers. The server never trusts
  // this value; candidateId is always read from the authorized interview row.
  candidateId: z.string().min(1).optional(),
  status: z.enum(["completed", "canceled"]),
});

/** Mark an interview completed or canceled from the candidate profile. */
export async function setInterviewStatus(input: {
  interviewId: string;
  candidateId?: string;
  status: "completed" | "canceled";
}): Promise<{ success: boolean; error?: string; warning?: string; emailWarning?: string }> {
  const t = await getTranslations("server.interviews.actions");
  const tl = await getTranslations("labels.interviews");
  try {
    let emailWarning: string | undefined;
    const parsed = statusSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: t("invalidRequest") };
    }
    const { organization: workspace, user } = await getWorkspaceContext();

    await requireInterviewPermission(
      "interviews:manage",
      parsed.data.interviewId,
    );

    // Distinguish "doesn't exist" from "exists but no longer scheduled" so the
    // recruiter gets an accurate message instead of a misleading "not found"
    // when the interview was already completed/canceled.
    const [existing] = await db
      .select({ id: interviews.id, status: interviews.status })
      .from(interviews)
      .innerJoin(
        candidates,
        and(
          eq(candidates.id, interviews.candidateId),
          eq(candidates.workspaceId, workspace.id),
          isNull(candidates.deletedAt),
        ),
      )
      .where(
        and(
          eq(interviews.id, parsed.data.interviewId),
          eq(interviews.workspaceId, workspace.id),
        ),
      )
      .limit(1);
    if (!existing) {
      return { success: false, error: t("interviewNotFound") };
    }
    if (existing.status !== "scheduled") {
      return {
        success: false,
        error: t("noLongerScheduled"),
      };
    }

    const statusEvent: { current: PersistedDomainEvent | null } = {
      current: null,
    };
    const updated = await db.transaction(async (tx) => {
      const next = await tx
        .update(interviews)
        .set({ status: parsed.data.status })
        .where(
          and(
            eq(interviews.id, parsed.data.interviewId),
            eq(interviews.workspaceId, workspace.id),
            eq(interviews.status, "scheduled"),
          ),
        )
        .returning();
      const nextInterview = next[0];
      if (nextInterview) {
        statusEvent.current = await persistDomainEvent(tx, {
          name: `interview.${parsed.data.status}`,
          workspaceId: workspace.id,
          actorId: user.id,
          aggregateType: "interview",
          aggregateId: nextInterview.id,
          payload: { interview: serializeInterview(nextInterview) },
        });
      }
      return next;
    });

    if (updated.length === 0) {
      // Race: the interview changed status between our check and the update.
      return {
        success: false,
        error: t("noLongerScheduled"),
      };
    }

    const updatedInterview = updated[0];
    if (statusEvent.current) {
      await publishPersistedDomainEvents([statusEvent.current]);
    }
    const providerWarnings: string[] = [];

    const gcalEventId = updatedInterview?.gcalEventId;
    if (parsed.data.status === "canceled" && gcalEventId) {
      const canceled = await trackInterviewSync({
        workspaceId: workspace.id,
        interviewId: parsed.data.interviewId,
        provider: "google_calendar",
        operation: "cancel",
        run: () =>
          cancelInterviewGCalEvent({
            workspaceId: workspace.id,
            interviewId: parsed.data.interviewId,
            gcalEventId,
          }),
        isSuccess: Boolean,
      });
      if (!canceled) providerWarnings.push("Google Calendar");
    }

    const teamsMeetingId = updatedInterview?.teamsMeetingId;
    if (parsed.data.status === "canceled" && teamsMeetingId) {
      const canceled = await trackInterviewSync({
        workspaceId: workspace.id,
        interviewId: parsed.data.interviewId,
        provider: "microsoft_teams",
        operation: "cancel",
        run: () =>
          cancelInterviewTeamsMeeting({
            workspaceId: workspace.id,
            interviewId: parsed.data.interviewId,
            teamsMeetingId,
          }),
        isSuccess: Boolean,
      });
      if (!canceled) providerWarnings.push("Microsoft Teams");
    }

    const zoomMeetingId = updatedInterview?.zoomMeetingId;
    if (parsed.data.status === "canceled" && zoomMeetingId) {
      const canceled = await trackInterviewSync({
        workspaceId: workspace.id,
        interviewId: parsed.data.interviewId,
        provider: "zoom",
        operation: "cancel",
        run: () =>
          cancelInterviewZoomMeeting({
            workspaceId: workspace.id,
            interviewId: parsed.data.interviewId,
            zoomMeetingId,
          }),
        isSuccess: Boolean,
      });
      if (!canceled) providerWarnings.push("Zoom");
    }

    if (parsed.data.status === "canceled" && updatedInterview?.jitsiRoom) {
      const canceled = await trackInterviewSync({
        workspaceId: workspace.id,
        interviewId: parsed.data.interviewId,
        provider: "jitsi",
        operation: "cancel",
        run: () =>
          cancelInterviewJitsiMeeting({
            workspaceId: workspace.id,
            interviewId: parsed.data.interviewId,
          }),
        isSuccess: Boolean,
      });
      if (!canceled) providerWarnings.push("Jitsi");
    }

    // Let the candidate know when an interview is called off.
    if (parsed.data.status === "canceled") {
      const [info] = await db
        .select({
          email: candidates.email,
          firstName: candidates.firstName,
          companyName: organization.name,
          jobTitle: jobs.title,
          type: interviews.type,
          scheduledAt: interviews.scheduledAt,
          applicationId: interviews.applicationId,
        })
        .from(interviews)
        .innerJoin(
          candidates,
          and(
            eq(candidates.id, interviews.candidateId),
            eq(candidates.workspaceId, workspace.id),
            isNull(candidates.deletedAt),
          ),
        )
        .innerJoin(
          jobs,
          and(
            eq(jobs.id, interviews.jobId),
            eq(jobs.workspaceId, workspace.id),
            isNull(jobs.deletedAt),
          ),
        )
        .innerJoin(organization, eq(organization.id, interviews.workspaceId))
        .where(
          and(
            eq(interviews.id, parsed.data.interviewId),
            eq(interviews.workspaceId, workspace.id),
          ),
        )
        .limit(1);

      if (info?.email) {
        const replyTo = await getInboundReplyTo(
          workspace.id,
          info.applicationId,
        );
        emailWarning = (await queueInterviewEmail(
          workspace.id,
          "interview.canceled",
          {
            interviewId: parsed.data.interviewId,
            revision: updatedInterview?.updatedAt?.getTime() ?? Date.now(),
            candidateEmail: info.email,
            candidateName: info.firstName,
            companyName: info.companyName,
            jobTitle: info.jobTitle,
            interviewType: interviewTypeTitle(tl, info.type),
            scheduledAt: info.scheduledAt.toISOString(),
            replyTo,
          },
          user.id,
          undefined,
          t,
        )).warning;
      }
    }

    revalidatePath(`/dashboard/candidates/${updatedInterview.candidateId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendars");

    // Emit outbound webhook event. Payload matches the REST API layer
    // (interview: serializeInterview(...)) so webhook consumers see the same
    // shape regardless of whether the action came from the dashboard or the API.
    const event = `interview.${parsed.data.status}` as const;
    void emitWebhookEvent(workspace.id, event, {
      interview: serializeInterview(updatedInterview),
      eventId: statusEvent.current?.eventId,
    }, { actorId: user.id, skipDomainEvent: true, eventId: statusEvent.current?.eventId });

    return {
      success: true,
      ...(emailWarning ? { emailWarning } : {}),
      ...(providerWarnings.length > 0
        ? {
            warning: t("cancelSyncWarning", { providers: providerWarnings.join(", ") }),
          }
        : {}),
    };
  } catch (error) {
    log.error(error, "setInterviewStatus failed");
    return {
      success: false,
      error: t("unableToUpdate"),
    };
  }
}

function buildRescheduleSchema(t: Translate) {
  return z.object({
  interviewId: z.string().min(1),
  // Legacy callers may still send this field, but it is deliberately ignored.
  candidateId: z.string().min(1).optional(),
  scheduledAt: z
    .string()
    .min(1, t("pickDateTime"))
    .refine((value) => !Number.isNaN(Date.parse(value)), t("invalidDateTime")),
  timeZone: z
    .string()
    .trim()
    .max(80)
    .refine((value) => {
      if (!value) return true;
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    }, t("invalidTimezone"))
    .nullable()
    .optional(),
  durationMins: z.coerce.number().int().min(5).max(480).default(45),
  location: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .optional(),
  });
}

/** Reschedule an interview to a new date/time and update the GCal event. */
export async function rescheduleInterview(input: {
  interviewId: string;
  candidateId?: string;
  scheduledAt: string;
  timeZone?: string | null;
  durationMins: number;
  location?: string | null;
}): Promise<{ success: boolean; error?: string; warning?: string; emailWarning?: string }> {
  const t = await getTranslations("server.interviews.actions");
  const tl = await getTranslations("labels.interviews");
  try {
    let emailWarning: string | undefined;
    const parsed = buildRescheduleSchema(t).safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? t("invalidInput"),
      };
    }

    const { organization: workspace, user } = await getWorkspaceContext();
    const data = parsed.data;
    const parsedWhen = parseInterviewTime(t, data.scheduledAt, data.timeZone);
    if (!parsedWhen.ok) return { success: false, error: parsedWhen.error };
    const when = parsedWhen.when;

    await requireInterviewPermission(
      "interviews:manage",
      parsed.data.interviewId,
    );

    if (isPastWhen(when)) {
      return {
        success: false,
        error: t("timeInPast"),
      };
    }

    // The in-app text and the reschedule email both use the original invite's zone.
    const displayZone = await resolveInterviewEmailZoneFor({
      workspaceId: workspace.id,
      kind: "interview.rescheduled",
      interviewId: data.interviewId,
      requested: data.timeZone ?? null,
      actorId: user.id,
    });

    // Load the current interview first so the provider meeting is recreated
    // BEFORE we mutate the row. If the provider call fails, the database keeps
    // the original time and a still-valid meeting, so a retry stays consistent.
    const [row] = await db
      .select({
        id: interviews.id,
        candidateId: interviews.candidateId,
        meetLink: interviews.meetLink,
        gcalEventId: interviews.gcalEventId,
        teamsMeetingId: interviews.teamsMeetingId,
        zoomMeetingId: interviews.zoomMeetingId,
        jitsiRoom: interviews.jitsiRoom,
        mode: interviews.mode,
        title: interviews.title,
        type: interviews.type,
        status: interviews.status,
      })
      .from(interviews)
      .where(
        and(
          eq(interviews.id, data.interviewId),
          eq(interviews.workspaceId, workspace.id),
        ),
      )
      .limit(1);

    if (!row) {
      return { success: false, error: t("interviewNotFound") };
    }
    if (row.status !== "scheduled") {
      return {
        success: false,
        error: t("noLongerScheduled"),
      };
    }

    // Fetch interview context for GCal attendees + candidate notification.
    const [info] = await db
      .select({
        email: candidates.email,
        firstName: candidates.firstName,
        companyName: organization.name,
        jobTitle: jobs.title,
        type: interviews.type,
        mode: interviews.mode,
        interviewerId: interviews.interviewerId,
        applicationId: interviews.applicationId,
      })
      .from(interviews)
      .innerJoin(
        candidates,
        and(
          eq(candidates.id, interviews.candidateId),
          eq(candidates.workspaceId, workspace.id),
          isNull(candidates.deletedAt),
        ),
      )
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, interviews.jobId),
          eq(jobs.workspaceId, workspace.id),
          isNull(jobs.deletedAt),
        ),
      )
      .innerJoin(organization, eq(organization.id, interviews.workspaceId))
      .where(
        and(
          eq(interviews.id, data.interviewId),
          eq(interviews.workspaceId, workspace.id),
        ),
      )
      .limit(1);

    if (!info) {
      return {
        success: false,
        error: t("candidateOrJobInactive"),
      };
    }

    // Resolve attendee emails for GCal invitations.
    let interviewerEmail: string | undefined;
    if (info?.interviewerId) {
      const [interviewer] = await db
        .select({ email: authUsers.email })
        .from(authUsers)
        .where(eq(authUsers.id, info.interviewerId))
        .limit(1);
      interviewerEmail = interviewer?.email ?? undefined;
    }
    const attendees = [info?.email, interviewerEmail].filter((e): e is string =>
      Boolean(e),
    );

    // Re-validate interviewer availability at the new time (excluding self).
    // scheduleInterview checks this on create; reschedule previously skipped it,
    // so moving an interview could silently double-book the interviewer.
    if (info?.interviewerId) {
      const conflict = await hasInterviewerConflict(db, {
        workspaceId: workspace.id,
        interviewerId: info.interviewerId,
        when,
        durationMins: data.durationMins,
        excludeInterviewId: data.interviewId,
      });
      if (conflict) {
        return {
          success: false,
          error: t("interviewerConflict"),
        };
      }
    }

    let calendarWarning: string | undefined;
    const syncCalendar = async () => {
      // Sync to Google Calendar only after any standalone video replacement has
      // been created and persisted. This keeps a failed Zoom/Teams replacement
      // from leaving the candidate with mixed old/new schedule state.
      if (row?.gcalEventId) {
        try {
          const updated = await trackInterviewSync({
            workspaceId: workspace.id,
            interviewId: row.id,
            provider: "google_calendar",
            operation: "upsert",
            run: () =>
              updateInterviewGCalEvent({
                workspaceId: workspace.id,
                gcalEventId: row.gcalEventId!,
                start: when,
                durationMins: data.durationMins,
                attendees: attendees.length > 0 ? attendees : undefined,
                location: data.location ?? undefined,
                timeZone: data.timeZone ?? "UTC",
              }),
            isSuccess: Boolean,
          });
          if (!updated) {
            calendarWarning =
              t("gcalUpdateFailed");
            log.warn("rescheduleInterview: GCal event update failed");
          }
        } catch (error) {
          calendarWarning =
            t("gcalUpdateFailed");
          log.warn(error, "rescheduleInterview: GCal event update failed");
        }
      } else if (
        !row?.teamsMeetingId &&
        !row?.zoomMeetingId &&
        !row?.jitsiRoom
      ) {
        const gcalResult = await trackInterviewSync({
          workspaceId: workspace.id,
          interviewId: row.id,
          provider: "google_calendar",
          operation: "upsert",
          run: () =>
            syncInterviewToGCal({
              workspaceId: workspace.id,
              interviewId: row.id,
              summary:
                row.title ??
                interviewTypeTitle(tl, row.type ?? "screening"),
              start: when,
              durationMins: data.durationMins,
              attendees: attendees.length > 0 ? attendees : undefined,
              location: data.location ?? undefined,
              mode: info.mode,
              timeZone: data.timeZone ?? "UTC",
            }),
          isSuccess: (result) => result.ok,
          resourceId: (result) => (result.ok ? result.eventId : undefined),
          resourceUrl: (result) => (result.ok ? result.meetLink : undefined),
        });
        if (!gcalResult || !gcalResult.ok) {
          calendarWarning =
            t("gcalUpdateFailed");
          log.warn(
            { reason: gcalResult?.reason },
            "rescheduleInterview: GCal sync failed, event may be stale",
          );
        }
      }
    };

    // Teams and Zoom meetings are standalone objects. Create and persist the
    // replacement first; the provider adapter compensates if old-meeting
    // deletion fails, so the candidate never receives a dead link.
    const summary =
      row?.title ??
      interviewTypeTitle(tl, row?.type ?? "screening");
    if (info?.mode === "video" && row?.teamsMeetingId) {
      const replacement = await trackInterviewSync({
        workspaceId: workspace.id,
        interviewId: row.id,
        provider: "microsoft_teams",
        operation: "upsert",
        run: () =>
          replaceInterviewToTeams({
            workspaceId: workspace.id,
            interviewId: row.id,
            previousMeetingId: row.teamsMeetingId!,
            previousMeetLink: row.meetLink,
            summary,
            start: when,
            durationMins: data.durationMins,
          }),
        isSuccess: (result) => Boolean(result && "ok" in result && result.ok),
        resourceId: (result) =>
          result && "ok" in result && result.ok ? result.meetingId : undefined,
        resourceUrl: (result) =>
          result && "ok" in result && result.ok ? result.joinUrl : undefined,
      });
      if (!replacement || !("ok" in replacement) || !replacement.ok) {
        return {
          success: false,
          error: t("teamsReplaceFailed"),
        };
      }
    } else if (info?.mode === "video" && row?.zoomMeetingId) {
      const replacement = await trackInterviewSync({
        workspaceId: workspace.id,
        interviewId: row.id,
        provider: "zoom",
        operation: "upsert",
        run: () =>
          replaceInterviewToZoom({
            workspaceId: workspace.id,
            interviewId: row.id,
            previousMeetingId: row.zoomMeetingId!,
            previousMeetLink: row.meetLink,
            summary,
            start: when,
            durationMins: data.durationMins,
          }),
        isSuccess: (result) => Boolean(result && "ok" in result && result.ok),
        resourceId: (result) =>
          result && "ok" in result && result.ok ? result.meetingId : undefined,
        resourceUrl: (result) =>
          result && "ok" in result && result.ok ? result.joinUrl : undefined,
      });
      if (!replacement || !("ok" in replacement) || !replacement.ok) {
        return {
          success: false,
          error: t("zoomReplaceFailed"),
        };
      }
    }

    await syncCalendar();

    // Persist the new time/location only after the provider meeting was
    // successfully recreated, keeping DB and provider state consistent.
    // Only recompute the manual meetLink when no provider owns it , Zoom/Teams/
    // Jitsi write their own link and must not be overwritten from `location`.
    const hasProviderMeeting =
      Boolean(row.teamsMeetingId) ||
      Boolean(row.zoomMeetingId) ||
      Boolean(row.jitsiRoom);
    const revisionAt = new Date();
    const rescheduleSet: Record<string, unknown> = {
      scheduledAt: when,
      durationMins: data.durationMins,
      location: data.location ?? null,
      updatedAt: revisionAt,
    };
    if (!hasProviderMeeting) {
      rescheduleSet.meetLink = deriveMeetLink(row.mode, data.location);
    }
    let persistedEvent: PersistedDomainEvent | undefined;
    const persisted = await db.transaction(async (tx) => {
      if (info.interviewerId) {
        await lockInterviewerSchedule(tx, workspace.id, info.interviewerId);
        const conflict = await hasInterviewerConflict(tx, {
          workspaceId: workspace.id,
          interviewerId: info.interviewerId,
          when,
          durationMins: data.durationMins,
          excludeInterviewId: data.interviewId,
        });
        if (conflict) {
          return {
            ok: false as const,
            error: t("interviewerConflict"),
          };
        }
      }

      const [updated] = await tx
        .update(interviews)
        .set(rescheduleSet)
        .where(
          and(
            eq(interviews.id, data.interviewId),
            eq(interviews.workspaceId, workspace.id),
            eq(interviews.status, "scheduled"),
          ),
        )
        .returning({ id: interviews.id });
      if (!updated) {
        return {
          ok: false as const,
          error: t("noLongerScheduled"),
        };
      }

      await tx.insert(candidatePortalNotifications).values({
        workspaceId: workspace.id,
        candidateId: row.candidateId,
        type: "interview_rescheduled",
        title: t("rescheduledTitle"),
        body: t("rescheduledBody", { when: formatInterviewWhen(when, displayZone) }),
        href: info?.applicationId
          ? `/portal/applications/${info.applicationId}`
          : null,
        metadata: {
          interviewId: data.interviewId,
          applicationId: info?.applicationId,
        },
      });

      persistedEvent = await persistDomainEvent(tx, {
        workspaceId: workspace.id,
        name: "interview.rescheduled",
        aggregateType: "interview",
        aggregateId: data.interviewId,
        actorId: user.id,
        payload: {
          interview: {
            id: data.interviewId,
            candidateId: row.candidateId,
            scheduledAt: when.toISOString(),
            durationMins: data.durationMins,
            location: data.location ?? null,
          },
        },
      });
      return { ok: true as const };
    });
    if (!persisted.ok) {
      return {
        success: false,
        error: persisted.error,
      };
    }
    if (persistedEvent) await publishPersistedDomainEvents([persistedEvent]);

    const [synced] = await db
      .select({ meetLink: interviews.meetLink })
      .from(interviews)
      .where(
        and(
          eq(interviews.id, row!.id),
          eq(interviews.workspaceId, workspace.id),
        ),
      )
      .limit(1);
    const deliveryLocation = synced?.meetLink ?? data.location ?? undefined;

    if (info?.email) {
      const replyTo = await getInboundReplyTo(workspace.id, info.applicationId);
      emailWarning = (await queueInterviewEmail(
        workspace.id,
        "interview.rescheduled",
        {
          interviewId: data.interviewId,
          revision: revisionAt.getTime(),
          candidateEmail: info.email,
          candidateName: info.firstName,
          companyName: info.companyName,
          jobTitle: info.jobTitle,
          interviewType: interviewTypeTitle(tl, info.type),
          scheduledAt: when.toISOString(),
          mode: interviewModeTitle(tl, info.mode),
          location: deliveryLocation,
          durationMins: data.durationMins,
          timeZone: data.timeZone ?? null,
          replyTo,
        },
        user.id,
        displayZone,
        t,
      )).warning;
    }

    revalidatePath(`/dashboard/candidates/${row.candidateId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendars");

    // Emit outbound webhook event.
    void emitWebhookEvent(workspace.id, "interview.rescheduled", {
      interview: {
        id: data.interviewId,
        candidateId: row.candidateId,
        scheduledAt: when.toISOString(),
        durationMins: data.durationMins,
        location: data.location ?? null,
      },
      eventId: persistedEvent?.eventId,
    }, { actorId: user.id, skipDomainEvent: true, eventId: persistedEvent?.eventId });

    return { success: true, ...(calendarWarning ? { warning: calendarWarning } : {}), ...(emailWarning ? { emailWarning } : {}) };
  } catch (error) {
    log.error(error, "rescheduleInterview failed");
    return {
      success: false,
      error: t("unableToReschedule"),
    };
  }
}

function buildUpdateSchema(t: Translate) {
  return z.object({
  interviewId: z.string().min(1),
  // Legacy callers may still send this field, but it is deliberately ignored.
  candidateId: z.string().min(1).optional(),
  type: z.enum(interviewTypes).optional(),
  mode: z.enum(interviewModes).optional(),
  scheduledAt: z
    .string()
    .refine(
      (value) => value === "" || !Number.isNaN(Date.parse(value)),
      t("invalidDateTime"),
    )
    .optional(),
  timeZone: z
    .string()
    .trim()
    .max(80)
    .refine((value) => {
      if (!value) return true;
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    }, t("invalidTimezone"))
    .nullable()
    .optional(),
  durationMins: z.coerce.number().int().min(5).max(480).optional(),
  interviewerId: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .optional(),
  title: z
    .string()
    .trim()
    .max(120)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .optional(),
  location: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .optional(),
  notes: z
    .string()
    .trim()
    .max(5000)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .optional(),
  });
}

/**
 * Full edit: update any combination of interview fields. Syncs to GCal and
 * sends a rescheduled email when the date/time changes.
 */
export async function updateInterview(input: {
  interviewId: string;
  candidateId?: string;
  type?: "screening" | "culture_fit" | "technical" | "onsite" | "final";
  mode?: "video" | "phone" | "onsite";
  scheduledAt?: string;
  timeZone?: string | null;
  durationMins?: number;
  interviewerId?: string | null;
  title?: string | null;
  location?: string | null;
  notes?: string | null;
}): Promise<{ success: boolean; error?: string; warning?: string; emailWarning?: string }> {
  const t = await getTranslations("server.interviews.actions");
  const tl = await getTranslations("labels.interviews");
  try {
    let emailWarning: string | undefined;
    const parsed = buildUpdateSchema(t).safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? t("invalidInput"),
      };
    }

    const { organization: workspace, user } = await getWorkspaceContext();
    const data = parsed.data;

    await requireInterviewPermission(
      "interviews:manage",
      parsed.data.interviewId,
    );

    if (
      data.interviewerId &&
      !(await isWorkspaceMember(workspace.id, data.interviewerId))
    ) {
      return {
        success: false,
        error: t("interviewerNotInWorkspace"),
      };
    }

    // Parse the new time with the recruiter's timezone (same wall-clock
    // interpretation as scheduleInterview). Previously this used new Date()
    // directly, which interpreted naive strings as UTC and shifted the time.
    let when: Date | undefined;
    if (data.scheduledAt && data.scheduledAt !== "") {
      const parsedWhen = parseInterviewTime(t, data.scheduledAt, data.timeZone);
      if (!parsedWhen.ok) return { success: false, error: parsedWhen.error };
      when = parsedWhen.when;
    }
    if (when && isPastWhen(when)) {
      return {
        success: false,
        error: t("timeInPast"),
      };
    }

    // Build the update payload , only set fields that were explicitly provided.
    const revisionAt = new Date();
    const set: Record<string, unknown> = { updatedAt: revisionAt };
    if (data.type !== undefined) set.type = data.type;
    if (data.mode !== undefined) set.mode = data.mode;
    if (data.title !== undefined) set.title = data.title;
    if (data.interviewerId !== undefined)
      set.interviewerId = data.interviewerId;
    if (data.location !== undefined) set.location = data.location;
    if (data.notes !== undefined) set.notes = data.notes;
    if (data.durationMins !== undefined) set.durationMins = data.durationMins;
    if (when) {
      set.scheduledAt = when;
    }

    // Load the current interview first and recreate the provider meeting
    // before mutating the row, so a provider failure leaves a consistent state.
    const [row] = await db
      .select({
        id: interviews.id,
        candidateId: interviews.candidateId,
        gcalEventId: interviews.gcalEventId,
        teamsMeetingId: interviews.teamsMeetingId,
        zoomMeetingId: interviews.zoomMeetingId,
        jitsiRoom: interviews.jitsiRoom,
        meetLink: interviews.meetLink,
        location: interviews.location,
        scheduledAt: interviews.scheduledAt,
        durationMins: interviews.durationMins,
        type: interviews.type,
        mode: interviews.mode,
        title: interviews.title,
        status: interviews.status,
      })
      .from(interviews)
      .where(
        and(
          eq(interviews.id, data.interviewId),
          eq(interviews.workspaceId, workspace.id),
        ),
      )
      .limit(1);

    if (!row) {
      return { success: false, error: t("interviewNotFound") };
    }
    if (row.status !== "scheduled") {
      return {
        success: false,
        error: t("noLongerScheduled"),
      };
    }

    // Fetch full context for GCal sync and email.
    const [info] = await db
      .select({
        email: candidates.email,
        firstName: candidates.firstName,
        companyName: organization.name,
        jobTitle: jobs.title,
        interviewerId: interviews.interviewerId,
        mode: interviews.mode,
        scheduledAt: interviews.scheduledAt,
        applicationId: interviews.applicationId,
      })
      .from(interviews)
      .innerJoin(
        candidates,
        and(
          eq(candidates.id, interviews.candidateId),
          eq(candidates.workspaceId, workspace.id),
          isNull(candidates.deletedAt),
        ),
      )
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, interviews.jobId),
          eq(jobs.workspaceId, workspace.id),
          isNull(jobs.deletedAt),
        ),
      )
      .innerJoin(organization, eq(organization.id, interviews.workspaceId))
      .where(
        and(
          eq(interviews.id, data.interviewId),
          eq(interviews.workspaceId, workspace.id),
        ),
      )
      .limit(1);

    if (!info) {
      return {
        success: false,
        error: t("candidateOrJobInactive"),
      };
    }

    // Resolve attendee emails for GCal invitations.
    let interviewerEmail: string | undefined;
    if (info?.interviewerId) {
      const [interviewer] = await db
        .select({ email: authUsers.email })
        .from(authUsers)
        .where(eq(authUsers.id, info.interviewerId))
        .limit(1);
      interviewerEmail = interviewer?.email ?? undefined;
    }
    const attendees = [info?.email, interviewerEmail].filter((e): e is string =>
      Boolean(e),
    );

    const effectiveScheduledAt = when ?? row.scheduledAt;
    const effectiveDurationMins = data.durationMins ?? row.durationMins;
    const effectiveMode = data.mode ?? row.mode;
    const effectiveTitle = data.title ?? row.title;
    // The interviewer we'll validate against: the new one if changing, else the
    // existing one (so a time-only edit still checks the current interviewer).
    const effectiveInterviewerId =
      data.interviewerId !== undefined
        ? data.interviewerId
        : info?.interviewerId;

    // Re-validate interviewer availability when the time/duration/interviewer
    // changes (excluding self). updateInterview previously skipped this, so an
    // edit could silently double-book the interviewer.
    const changesTimeOrDuration =
      data.scheduledAt !== undefined ||
      data.durationMins !== undefined ||
      data.interviewerId !== undefined;
    if (effectiveInterviewerId && changesTimeOrDuration) {
      const conflict = await hasInterviewerConflict(db, {
        workspaceId: workspace.id,
        interviewerId: effectiveInterviewerId,
        when: effectiveScheduledAt,
        durationMins: effectiveDurationMins,
        excludeInterviewId: data.interviewId,
      });
      if (conflict) {
        return {
          success: false,
          error: t("interviewerConflict"),
        };
      }
    }

    let calendarWarning: string | undefined;

    // Sync to Google Calendar if the event was previously synced. Await so a
    // GCal failure is logged instead of silently leaving a stale event.
    if (row?.gcalEventId) {
      try {
          const updated = await trackInterviewSync({
            workspaceId: workspace.id,
            interviewId: row.id,
            provider: "google_calendar",
            operation: "upsert",
            run: () =>
              updateInterviewGCalEvent({
                workspaceId: workspace.id,
                gcalEventId: row.gcalEventId!,
                start: effectiveScheduledAt,
                durationMins: effectiveDurationMins,
                attendees: attendees.length > 0 ? attendees : undefined,
                location: data.location ?? undefined,
                timeZone: data.timeZone ?? "UTC",
              }),
            isSuccess: Boolean,
          });
          if (!updated) {
            calendarWarning =
              t("gcalUpdateFailed");
            log.warn("updateInterview: GCal event update failed");
          }
        } catch (error) {
          calendarWarning =
            t("gcalUpdateFailed");
          log.warn(error, "updateInterview: GCal event update failed");
      }
    }

    // Keep the video-provider meeting aligned with edits made from the detail
    // form too (not only the dedicated reschedule action). Provider objects do
    // not share a universal update API, so recreate the existing provider's
    // meeting after its old one is cancelled.
    const changesMeeting =
      data.scheduledAt !== undefined ||
      data.durationMins !== undefined ||
      data.mode !== undefined ||
      data.title !== undefined;
    if (changesMeeting && row && info) {
      const start = effectiveScheduledAt;
      const durationMins = effectiveDurationMins;
      const summary =
        effectiveTitle ??
        interviewTypeTitle(tl, data.type ?? row.type);
      if (row.teamsMeetingId) {
        if (effectiveMode === "video") {
          const replacement = await trackInterviewSync({
            workspaceId: workspace.id,
            interviewId: row.id,
            provider: "microsoft_teams",
            operation: "upsert",
            run: () =>
              replaceInterviewToTeams({
                workspaceId: workspace.id,
                interviewId: row.id,
                previousMeetingId: row.teamsMeetingId!,
                previousMeetLink: row.meetLink,
                summary,
                start,
                durationMins,
              }),
            isSuccess: (result) => Boolean(result && "ok" in result && result.ok),
            resourceId: (result) =>
              result && "ok" in result && result.ok ? result.meetingId : undefined,
            resourceUrl: (result) =>
              result && "ok" in result && result.ok ? result.joinUrl : undefined,
          });
          if (!replacement || !("ok" in replacement) || !replacement.ok) {
            return {
              success: false,
              error: t("teamsReplaceFailed"),
            };
          }
        } else {
          const canceled = await trackInterviewSync({
            workspaceId: workspace.id,
            interviewId: row.id,
            provider: "microsoft_teams",
            operation: "cancel",
            run: () =>
              cancelInterviewTeamsMeeting({
                workspaceId: workspace.id,
                interviewId: row.id,
                teamsMeetingId: row.teamsMeetingId!,
              }),
            isSuccess: Boolean,
          });
          if (!canceled) {
            return { success: false, error: t("teamsCancelFailed") };
          }
        }
      } else if (row.zoomMeetingId) {
        if (effectiveMode === "video") {
          const replacement = await trackInterviewSync({
            workspaceId: workspace.id,
            interviewId: row.id,
            provider: "zoom",
            operation: "upsert",
            run: () =>
              replaceInterviewToZoom({
                workspaceId: workspace.id,
                interviewId: row.id,
                previousMeetingId: row.zoomMeetingId!,
                previousMeetLink: row.meetLink,
                summary,
                start,
                durationMins,
              }),
            isSuccess: (result) => Boolean(result && "ok" in result && result.ok),
            resourceId: (result) =>
              result && "ok" in result && result.ok ? result.meetingId : undefined,
            resourceUrl: (result) =>
              result && "ok" in result && result.ok ? result.joinUrl : undefined,
          });
          if (!replacement || !("ok" in replacement) || !replacement.ok) {
            return {
              success: false,
              error: t("zoomReplaceFailed"),
            };
          }
        } else {
          const canceled = await trackInterviewSync({
            workspaceId: workspace.id,
            interviewId: row.id,
            provider: "zoom",
            operation: "cancel",
            run: () =>
              cancelInterviewZoomMeeting({
                workspaceId: workspace.id,
                interviewId: row.id,
                zoomMeetingId: row.zoomMeetingId!,
              }),
            isSuccess: Boolean,
          });
          if (!canceled) {
            return { success: false, error: t("zoomCancelFailed") };
          }
        }
      } else if (
        effectiveMode === "video" &&
        data.mode !== undefined &&
        !row.teamsMeetingId &&
        !row.zoomMeetingId &&
        !row.gcalEventId
      ) {
        // The interview had no provider meeting (e.g. it was phone/onsite) and
        // is now switching to video. Create one using the same priority as
        // scheduleInterview (Zoom > Teams > Google Meet > Jitsi) so the
        // candidate receives a usable link instead of a video interview with
        // no meeting.
        const [zoomToken, outlookConfig, gcalConfig, jitsiConfig] =
          await Promise.all([
            getZoomToken(workspace.id),
            getWorkspaceOutlookConfig(workspace.id),
            getWorkspaceGCalConfig(workspace.id),
            getWorkspaceJitsiConfig(workspace.id),
        ]);
        if (zoomToken) {
          await trackInterviewSync({
            workspaceId: workspace.id,
            interviewId: row.id,
            provider: "zoom",
            operation: "upsert",
            run: () =>
              syncInterviewToZoom({
                workspaceId: workspace.id,
                interviewId: row.id,
                summary,
                start,
                durationMins,
              }),
            isSuccess: Boolean,
            resourceId: (result) => result?.meetingId,
            resourceUrl: (result) => result?.joinUrl,
          });
        } else if (outlookConfig) {
          await trackInterviewSync({
            workspaceId: workspace.id,
            interviewId: row.id,
            provider: "microsoft_teams",
            operation: "upsert",
            run: () =>
              syncInterviewToTeams({
                workspaceId: workspace.id,
                interviewId: row.id,
                summary,
                start,
                durationMins,
              }),
            isSuccess: Boolean,
            resourceId: (result) => result?.meetingId,
            resourceUrl: (result) => result?.joinUrl,
          });
        } else if (gcalConfig) {
          const gcalResult = await trackInterviewSync({
            workspaceId: workspace.id,
            interviewId: row.id,
            provider: "google_calendar",
            operation: "upsert",
            run: () =>
              syncInterviewToGCal({
                workspaceId: workspace.id,
                interviewId: row.id,
                summary,
                start,
                durationMins,
                attendees: attendees.length > 0 ? attendees : undefined,
                location: data.location ?? undefined,
                mode: "video",
                timeZone: data.timeZone ?? "UTC",
              }),
            isSuccess: (result) => result.ok,
            resourceId: (result) => (result.ok ? result.eventId : undefined),
            resourceUrl: (result) => (result.ok ? result.meetLink : undefined),
          });
          if (!gcalResult || !gcalResult.ok) {
            calendarWarning =
              t("gcalUpdateFailed");
          }
        } else if (jitsiConfig) {
          await trackInterviewSync({
            workspaceId: workspace.id,
            interviewId: row.id,
            provider: "jitsi",
            operation: "upsert",
            run: () =>
              syncInterviewToJitsi({
                workspaceId: workspace.id,
                interviewId: row.id,
              }),
            isSuccess: Boolean,
            resourceId: (result) => result?.room,
            resourceUrl: (result) => result?.joinUrl,
          });
        }
      }
    }

    // Recompute the manual meetLink when the location or mode changed. Provider
    // integrations (Zoom/Teams/Meet/Jitsi) write their own link straight to the
    // row and are left untouched; the manual path derives from `location` (and
    // clears a stale link when the interview is no longer a video call).
    if (data.location !== undefined || data.mode !== undefined) {
      const switchedToVideoNewProvider =
        effectiveMode === "video" &&
        data.mode !== undefined &&
        !row.teamsMeetingId &&
        !row.zoomMeetingId &&
        !row.gcalEventId;
      const providerHandlesLink =
        Boolean(row.teamsMeetingId) ||
        Boolean(row.zoomMeetingId) ||
        Boolean(row.jitsiRoom) ||
        Boolean(row.gcalEventId) ||
        switchedToVideoNewProvider;
      if (!(providerHandlesLink && effectiveMode === "video")) {
        const effectiveLocation =
          data.location !== undefined ? data.location : row.location;
        set.meetLink = deriveMeetLink(effectiveMode, effectiveLocation);
      }
    }

    // Persist the edits only after the provider meeting was successfully
    // recreated, keeping DB and provider state consistent.
    let persistedEvent: PersistedDomainEvent | undefined;
    const persisted = await db.transaction(async (tx) => {
      if (effectiveInterviewerId) {
        await lockInterviewerSchedule(tx, workspace.id, effectiveInterviewerId);
        if (
          await hasInterviewerConflict(tx, {
            workspaceId: workspace.id,
            interviewerId: effectiveInterviewerId,
            when: effectiveScheduledAt,
            durationMins: effectiveDurationMins,
            excludeInterviewId: data.interviewId,
          })
        ) {
          return {
            ok: false as const,
            error: t("interviewerConflict"),
          };
        }
      }

      const [updated] = await tx
        .update(interviews)
        .set(set)
        .where(
          and(
            eq(interviews.id, data.interviewId),
            eq(interviews.workspaceId, workspace.id),
            eq(interviews.status, "scheduled"),
          ),
        )
        .returning({ id: interviews.id });
      if (!updated) {
        return {
          ok: false as const,
          error: t("noLongerScheduled"),
        };
      }

      persistedEvent = await persistDomainEvent(tx, {
        workspaceId: workspace.id,
        name: "interview.rescheduled",
        aggregateType: "interview",
        aggregateId: data.interviewId,
        actorId: user.id,
        payload: {
          interview: {
            id: data.interviewId,
            candidateId: row.candidateId,
            scheduledAt: effectiveScheduledAt.toISOString(),
            durationMins: effectiveDurationMins,
            location: data.location ?? null,
          },
        },
      });
      return { ok: true as const };
    });
    if (!persisted.ok) {
      return {
        success: false,
        error: persisted.error,
      };
    }
    if (persistedEvent) await publishPersistedDomainEvents([persistedEvent]);

    // Send rescheduled email if date/time changed.
    if (data.scheduledAt && data.scheduledAt !== "" && info?.email) {
          const replyTo = await getInboundReplyTo(workspace.id, info.applicationId);
      emailWarning = (await queueInterviewEmail(
        workspace.id,
        "interview.rescheduled",
        {
          interviewId: data.interviewId,
          revision: revisionAt.getTime(),
          candidateEmail: info.email,
          candidateName: info.firstName,
          companyName: info.companyName,
          jobTitle: info.jobTitle,
          interviewType:
            interviewTypeTitle(tl, data.type ?? row.type),
          scheduledAt: effectiveScheduledAt.toISOString(),
          mode: interviewModeTitle(tl, effectiveMode),
          location: data.location ?? undefined,
          durationMins: effectiveDurationMins,
          timeZone: data.timeZone ?? null,
          replyTo,
        },
        user.id,
        undefined,
        t,
      )).warning;
    }

    revalidatePath(`/dashboard/candidates/${row.candidateId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendars");

    void emitWebhookEvent(workspace.id, "interview.rescheduled", {
      interview: {
        id: data.interviewId,
        candidateId: row.candidateId,
        scheduledAt: effectiveScheduledAt.toISOString(),
        durationMins: effectiveDurationMins,
        location: data.location ?? null,
      },
      eventId: persistedEvent?.eventId,
    }, { actorId: user.id, skipDomainEvent: true, eventId: persistedEvent?.eventId });

    return { success: true, ...(calendarWarning ? { warning: calendarWarning } : {}), ...(emailWarning ? { emailWarning } : {}) };
  } catch (error) {
    log.error(error, "updateInterview failed");
    return {
      success: false,
      error: t("unableToUpdate"),
    };
  }
}

// ── Interview Brief ─────────────────────────────────────────────────────────

const briefSchema = z.object({ interviewId: z.uuid() });

export type GenerateInterviewBriefResult =
  | { success: true; brief: InterviewBrief }
  | { success: false; error: string; reason?: "not_configured" };

/** Generate (or regenerate) an AI pre-interview brief and persist it on the row. */
export async function generateInterviewBriefAction(input: {
  interviewId: string;
}): Promise<GenerateInterviewBriefResult> {
  const t = await getTranslations("server.interviews.actions");
  const tl = await getTranslations("labels.interviews");
  const parsed = briefSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: t("invalidInterview") };
  }

  let context;
  try {
    context = await requireInterviewPermission(
      "collab:write",
      parsed.data.interviewId,
    );
  } catch {
    return {
      success: false,
      error: t("briefPermission"),
    };
  }
  const workspaceId = context.organization.id;

  const aiConfig = await getWorkspaceAiConfig(workspaceId);
  if (!aiConfig) {
    return {
      success: false,
      error: t("aiNotConfigured"),
      reason: "not_configured",
    };
  }

  const [briefRow] = await db
    .select({
      id: interviews.id,
      type: interviews.type,
      title: interviews.title,
      notes: interviews.notes,
      scheduledAt: interviews.scheduledAt,
      durationMins: interviews.durationMins,
      candidateId: interviews.candidateId,
      candidateFirst: candidates.firstName,
      candidateLast: candidates.lastName,
      candidateHeadline: candidates.headline,
      candidateLocation: candidates.location,
      candidateSkills: candidates.skills,
      candidateExperienceYears: candidates.experienceYears,
      jobTitle: jobs.title,
      jobDescription: jobs.description,
      jobRequirements: jobs.requirements,
    })
    .from(interviews)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, interviews.candidateId),
        eq(candidates.workspaceId, workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      jobs,
      and(
        eq(jobs.id, interviews.jobId),
        eq(jobs.workspaceId, workspaceId),
        isNull(jobs.deletedAt),
      ),
    )
    .where(
      and(
        eq(interviews.id, parsed.data.interviewId),
        eq(interviews.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!briefRow) {
    return { success: false, error: t("interviewNotFound") };
  }

  // Load resume text for richer brief context.
  let resumeText: string | null = null;
  const [resumeFile] = await db
    .select({
      fileName: candidateFiles.fileName,
      fileUrl: candidateFiles.fileUrl,
    })
    .from(candidateFiles)
    .where(
      and(
        eq(candidateFiles.workspaceId, workspaceId),
        eq(candidateFiles.candidateId, briefRow.candidateId),
      ),
    )
    .orderBy(desc(candidateFiles.createdAt))
    .limit(1);

  if (resumeFile) {
    const key = resumeKeyFromUrl(resumeFile.fileUrl);
    if (key) {
      try {
        const buffer = await storage.read(key);
        if (buffer.byteLength > 0 && buffer.byteLength <= maxResumeFileSize) {
          const { text } = await extractResumeText({
            buffer,
            fileName: resumeFile.fileName,
          });
          resumeText = text.trim() || null;
        }
      } catch {
        // Resume unavailable , proceed without it.
      }
    }
  }

  function stripHtml(html: string | null): string {
    if (!html) return "";
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  try {
    // The AI surface owns the prompt, so candidate identity follows the
    // workspace anonymization setting exactly as it does everywhere else.
    const brief = await generateInterviewBriefWithAI(aiConfig, {
      candidate: {
        fullName: `${briefRow.candidateFirst} ${briefRow.candidateLast}`.trim(),
        headline: briefRow.candidateHeadline,
        location: briefRow.candidateLocation,
        skills: Array.isArray(briefRow.candidateSkills)
          ? (briefRow.candidateSkills as string[])
          : [],
        experienceYears: briefRow.candidateExperienceYears,
        resumeText,
      },
      job: {
        title: briefRow.jobTitle,
        description: stripHtml(briefRow.jobDescription),
        requirements: briefRow.jobRequirements
          ? stripHtml(briefRow.jobRequirements)
          : null,
        keywords: [],
      },
      interview: {
        type: interviewTypeTitle(tl, briefRow.type),
        scheduledAt: briefRow.scheduledAt,
        interviewerName: null,
        durationMins: briefRow.durationMins,
        notes: briefRow.notes,
      },
      existingScore: null,
    });

    await db
      .update(interviews)
      .set({ briefContent: brief, updatedAt: new Date() })
      .where(
        and(
          eq(interviews.id, parsed.data.interviewId),
          eq(interviews.workspaceId, workspaceId),
        ),
      );

    revalidatePath(`/dashboard/candidates/${briefRow.candidateId}`);
    return { success: true, brief };
  } catch (briefError) {
    log.error(briefError, "generateInterviewBriefAction failed");
    return {
      success: false,
      error:
        t("briefFailed"),
    };
  }
}

// ── Interview Notes Summarizer ───────────────────────────────────────────────

function buildSummarizeSchema(t: Translate) {
  return z.object({
  interviewId: z.uuid(),
  rawNotes: z.string().trim().min(1, t("notesRequired")).max(8000),
  });
}

export type SummarizeInterviewNotesResult =
  | { success: true; summary: InterviewNotesSummary }
  | { success: false; error: string; reason?: "not_configured" };

/** Summarize raw post-interview notes into structured AI output (not persisted). */
export async function summarizeInterviewNotesAction(input: {
  interviewId: string;
  rawNotes: string;
}): Promise<SummarizeInterviewNotesResult> {
  const t = await getTranslations("server.interviews.actions");
  const tl = await getTranslations("labels.interviews");
  const parsed = buildSummarizeSchema(t).safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? t("invalidInput"),
    };
  }

  let context;
  try {
    context = await requireInterviewPermission(
      "collab:write",
      parsed.data.interviewId,
    );
  } catch {
    return {
      success: false,
      error: t("summaryPermission"),
    };
  }
  const workspaceId = context.organization.id;

  const aiConfig = await getWorkspaceAiConfig(workspaceId);
  if (!aiConfig) {
    return {
      success: false,
      error: t("aiNotConfigured"),
      reason: "not_configured",
    };
  }

  const [sumRow] = await db
    .select({
      type: interviews.type,
      title: interviews.title,
      candidateFirst: candidates.firstName,
      candidateLast: candidates.lastName,
      jobTitle: jobs.title,
    })
    .from(interviews)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, interviews.candidateId),
        eq(candidates.workspaceId, workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      jobs,
      and(
        eq(jobs.id, interviews.jobId),
        eq(jobs.workspaceId, workspaceId),
        isNull(jobs.deletedAt),
      ),
    )
    .where(
      and(
        eq(interviews.id, parsed.data.interviewId),
        eq(interviews.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!sumRow) {
    return { success: false, error: t("interviewNotFound") };
  }

  try {
    const summary = await summarizeInterviewNotesWithAI(aiConfig, {
      rawNotes: parsed.data.rawNotes,
      candidateName: `${sumRow.candidateFirst} ${sumRow.candidateLast}`,
      jobTitle: sumRow.jobTitle,
      interviewType:
        sumRow.title ?? interviewTypeTitle(tl, sumRow.type),
    });

    return { success: true, summary };
  } catch (sumError) {
    log.error(sumError, "summarizeInterviewNotesAction failed");
    return {
      success: false,
      error:
        t("summaryFailed"),
    };
  }
}
