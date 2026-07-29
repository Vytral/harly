"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { Output, generateText } from "ai";
import { z } from "zod";

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
  syncInterviewToGCal,
  cancelInterviewGCalEvent,
  updateInterviewGCalEvent,
} from "@/lib/gcal/sync";
import { getWorkspaceGCalConfig } from "@/lib/gcal/config";
import {
  syncInterviewToTeams,
  cancelInterviewTeamsMeeting,
} from "@/lib/outlook/teams-sync";
import { getWorkspaceOutlookConfig } from "@/lib/outlook/config";
import {
  syncInterviewToZoom,
  cancelInterviewZoomMeeting,
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
  requirePermission,
} from "@/features/workspaces/permissions-server";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { getModel } from "@/lib/ai/registry";
import { summarizeInterviewNotesWithAI } from "@/lib/ai/surfaces/summarize-interview-notes";
import {
  interviewBriefSchema,
  type InterviewBrief,
  type InterviewNotesSummary,
} from "@/lib/ai/schemas";
import { createLogger } from "@/lib/logger";
import { deriveMeetLink, parseScheduledAt } from "@/features/interviews/shared";
import { extractResumeText } from "@/lib/resume/extract-text";
import { resumeKeyFromUrl } from "@/lib/resume/storage-key";
import { storage } from "@/lib/storage";
import { maxResumeFileSize } from "@/lib/storage-validation";
import {
  enqueueEmailOutbox,
  processEmailOutbox,
} from "@/lib/email/outbox-processor";
import { findWorkspaceMember } from "./core";
import { serializeInterview } from "./service";

const log = createLogger("interviews");

const INTERVIEW_TYPE_LABEL: Record<string, string> = {
  screening: "Screening interview",
  culture_fit: "Culture fit interview",
  technical: "Technical interview",
  onsite: "On-site interview",
  final: "Final interview",
};

const INTERVIEW_MODE_LABEL: Record<string, string> = {
  video: "Video call",
  phone: "Phone call",
  onsite: "On-site",
};

async function queueInterviewEmail(
  workspaceId: string,
  kind: "interview.scheduled" | "interview.rescheduled" | "interview.canceled",
  payload: Record<string, unknown>,
  actorId?: string,
): Promise<"sent" | "failed"> {
  try {
    const id = await enqueueEmailOutbox(
      workspaceId,
      kind,
      payload,
      undefined,
      actorId,
    );
    const result = await processEmailOutbox({ ids: [id], workspaceId });
    return result.sent > 0 && result.failed === 0 ? "sent" : "failed";
  } catch (error) {
    log.error(error, "Interview email could not be delivered");
    return "failed";
  }
}

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
    sql`${interviews.scheduledAt} < ${new Date(input.when.getTime() + input.durationMins * 60_000)}`,
    sql`${interviews.scheduledAt} + (${interviews.durationMins} * interval '1 minute') > ${input.when}`,
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

const interviewWhenFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "long",
  timeStyle: "short",
});

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

const scheduleSchema = z.object({
  workspaceId: z.string().min(1),
  candidateId: z.string().min(1),
  applicationId: z
    .string()
    .min(1, "Pick which application this interview is for."),
  type: z.enum(interviewTypes),
  mode: z.enum(interviewModes),
  // Local datetime-string from the form (YYYY-MM-DDTHH:mm). Parsed to a Date below.
  scheduledAt: z
    .string()
    .min(1, "Pick a date and time.")
    .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date/time."),
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
    }, "Invalid timezone.")
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
  interviewId?: string;
}> {
  try {
    const parsed = scheduleSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid interview.",
      };
    }

    const { organization: workspace, user } = await getWorkspaceContext();
    if (workspace.id !== parsed.data.workspaceId) {
      return { success: false, error: "Workspace access denied." };
    }

    await requireApplicationPermission(
      "interviews:manage",
      parsed.data.applicationId,
    );

    const data = parsed.data;
    const when = parseScheduledAt(data.scheduledAt, data.timeZone);

    if (isPastWhen(when)) {
      return {
        success: false,
        error: "Interview time must be in the future.",
      };
    }

    if (
      data.interviewerId &&
      !(await isWorkspaceMember(workspace.id, data.interviewerId))
    ) {
      return {
        success: false,
        error: "Interviewer must belong to this workspace.",
      };
    }

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
        return { success: false as const, error: "Application not found." };
      }

      if (data.interviewerId) {
        const conflict = await hasInterviewerConflict(tx, {
          workspaceId: workspace.id,
          interviewerId: data.interviewerId,
          when,
          durationMins: data.durationMins,
        });
        if (conflict) {
          return {
            success: false as const,
            error: "This interviewer already has an overlapping interview.",
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
        .returning({ id: interviews.id });

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
        title: "Interview scheduled",
        body: `Your interview is scheduled for ${interviewWhenFormatter.format(when)}.`,
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

      return { success: true as const, interviewId: interview.id };
    });

    let warning: string | undefined;
    let emailStatus: InterviewEmailStatus | undefined;
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
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
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
        data.title ?? INTERVIEW_TYPE_LABEL[data.type] ?? "Interview";
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
            ? "Google Calendar needs to be reconnected; the interview was saved without a calendar event."
            : reason === "not_connected"
              ? "Google Calendar is not connected; the interview was saved without a calendar event."
              : "Google Calendar could not be updated; the interview was saved and can be synced later.",
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
              "The interview was saved, but an external video provider needs a meeting link.",
            );
          } else {
            await syncCalendar(false);
          }
        } else if (provider === "google_meet") {
          await syncCalendar(true);
        } else if (provider === "zoom") {
          if (!zoomToken) {
            warnings.push(
              "Zoom is not connected; the interview was saved without a video link.",
            );
          } else if (
            !(await syncInterviewToZoom({
              workspaceId: workspace.id,
              interviewId: result.interviewId,
              summary,
              start: when,
              durationMins: data.durationMins,
            }))
          ) {
            warnings.push(
              "Zoom could not create a meeting; the interview was saved without a video link.",
            );
          }
        } else if (provider === "teams") {
          if (!outlookConfig) {
            warnings.push(
              "Microsoft Teams is not connected; the interview was saved without a video link.",
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
                "Teams could not create a meeting; the interview was saved without a video link.",
              );
            }
          }
        } else if (provider === "jitsi") {
          if (!jitsiConfig) {
            warnings.push(
              "Jitsi Meet is not connected; the interview was saved without a video link.",
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
                "Jitsi could not create a meeting link; the interview was saved without a video link.",
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
              "Zoom could not create a meeting; the interview was saved without a video link.",
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
              "Teams could not create a meeting; the interview was saved without a video link.",
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
              "Jitsi could not create a meeting link; the interview was saved without a video link.",
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
            "The interview was saved, but no video link could be created.",
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
        emailStatus = await queueInterviewEmail(
          workspace.id,
          "interview.scheduled",
          {
            candidateEmail: recipient.email,
            candidateName: `${recipient.firstName} ${recipient.lastName}`,
            companyName: recipient.companyName,
            jobTitle: recipient.jobTitle,
            interviewType: INTERVIEW_TYPE_LABEL[data.type] ?? "Interview",
            scheduledAt: when.toISOString(),
            mode: INTERVIEW_MODE_LABEL[data.mode] ?? data.mode,
            location: deliveryLocation,
            durationMins: data.durationMins,
            notes: data.notes ?? undefined,
            replyTo,
            interviewerName,
          },
          user.id,
        );
        if (emailStatus === "failed") {
          warnings.push(
            "The interview was scheduled, but the invitation email could not be sent.",
          );
        }
      } else if (data.sendEmail) {
        emailStatus = "failed";
        warnings.push(
          "The interview was scheduled, but no candidate email address was available.",
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
      }, { actorId: user.id, skipDomainEvent: true });
      warning =
        warnings.length > 0 ? [...new Set(warnings)].join(" ") : undefined;
    }

    return {
      ...result,
      ...(emailStatus ? { emailStatus } : {}),
      ...(warning ? { warning } : {}),
    };
  } catch (error) {
    log.error(error, "scheduleInterview failed");
    return {
      success: false,
      error: "Unable to schedule interview.",
    };
  }
}

const statusSchema = z.object({
  interviewId: z.string().min(1),
  candidateId: z.string().min(1),
  status: z.enum(["completed", "canceled"]),
});

/** Mark an interview completed or canceled from the candidate profile. */
export async function setInterviewStatus(input: {
  interviewId: string;
  candidateId: string;
  status: "completed" | "canceled";
}): Promise<{ success: boolean; error?: string; warning?: string }> {
  try {
    const parsed = statusSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid request." };
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
      .where(
        and(
          eq(interviews.id, parsed.data.interviewId),
          eq(interviews.workspaceId, workspace.id),
        ),
      )
      .limit(1);
    if (!existing) {
      return { success: false, error: "Interview not found." };
    }
    if (existing.status !== "scheduled") {
      return {
        success: false,
        error: "This interview is no longer scheduled and can't be changed.",
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
        error: "This interview is no longer scheduled and can't be changed.",
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
        .innerJoin(candidates, eq(candidates.id, interviews.candidateId))
        .innerJoin(jobs, eq(jobs.id, interviews.jobId))
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
        await queueInterviewEmail(
          workspace.id,
          "interview.canceled",
          {
            candidateEmail: info.email,
            candidateName: info.firstName,
            companyName: info.companyName,
            jobTitle: info.jobTitle,
            interviewType: INTERVIEW_TYPE_LABEL[info.type] ?? "Interview",
            scheduledAt: info.scheduledAt.toISOString(),
            replyTo,
          },
          user.id,
        );
      }
    }

    revalidatePath(`/dashboard/candidates/${parsed.data.candidateId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendars");

    // Emit outbound webhook event. Payload matches the REST API layer
    // (interview: serializeInterview(...)) so webhook consumers see the same
    // shape regardless of whether the action came from the dashboard or the API.
    const event = `interview.${parsed.data.status}` as const;
    void emitWebhookEvent(workspace.id, event, {
      interview: serializeInterview(updatedInterview),
    }, { actorId: user.id, skipDomainEvent: true });

    return {
      success: true,
      ...(providerWarnings.length > 0
        ? {
            warning: `Interview canceled, but ${providerWarnings.join(", ")} could not be synchronized. The provider meeting may still exist and needs manual cleanup.`,
          }
        : {}),
    };
  } catch (error) {
    log.error(error, "setInterviewStatus failed");
    return {
      success: false,
      error: "Unable to update interview.",
    };
  }
}

const rescheduleSchema = z.object({
  interviewId: z.string().min(1),
  candidateId: z.string().min(1),
  scheduledAt: z
    .string()
    .min(1, "Pick a date and time.")
    .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date/time."),
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
    }, "Invalid timezone.")
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

/** Reschedule an interview to a new date/time and update the GCal event. */
export async function rescheduleInterview(input: {
  interviewId: string;
  candidateId: string;
  scheduledAt: string;
  timeZone?: string | null;
  durationMins: number;
  location?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = rescheduleSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input.",
      };
    }

    const { organization: workspace, user } = await getWorkspaceContext();
    const data = parsed.data;
    const when = parseScheduledAt(data.scheduledAt, data.timeZone);

    await requireInterviewPermission(
      "interviews:manage",
      parsed.data.interviewId,
    );

    if (isPastWhen(when)) {
      return {
        success: false,
        error: "Interview time must be in the future.",
      };
    }

    // Load the current interview first so the provider meeting is recreated
    // BEFORE we mutate the row. If the provider call fails, the database keeps
    // the original time and a still-valid meeting, so a retry stays consistent.
    const [row] = await db
      .select({
        id: interviews.id,
        gcalEventId: interviews.gcalEventId,
        teamsMeetingId: interviews.teamsMeetingId,
        zoomMeetingId: interviews.zoomMeetingId,
        jitsiRoom: interviews.jitsiRoom,
        mode: interviews.mode,
        title: interviews.title,
        type: interviews.type,
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
      return { success: false, error: "Interview not found." };
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
      .innerJoin(candidates, eq(candidates.id, interviews.candidateId))
      .innerJoin(jobs, eq(jobs.id, interviews.jobId))
      .innerJoin(organization, eq(organization.id, interviews.workspaceId))
      .where(
        and(
          eq(interviews.id, data.interviewId),
          eq(interviews.workspaceId, workspace.id),
        ),
      )
      .limit(1);

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
          error: "This interviewer already has an overlapping interview.",
        };
      }
    }

    // Sync to Google Calendar if the event was previously synced. Await (don't
    // fire-and-forget) so a GCal failure surfaces: the DB row keeps the new time
    // (already persisted below for the provider-recreate path), but we log the
    // calendar drift instead of silently leaving a stale event. scheduleInterview
    // collects a user-visible warning; reschedule logs because its return type
    // has no warning channel.
    if (row?.gcalEventId) {
      try {
        await updateInterviewGCalEvent({
          workspaceId: workspace.id,
          gcalEventId: row.gcalEventId,
          start: when,
          durationMins: data.durationMins,
          attendees: attendees.length > 0 ? attendees : undefined,
          location: data.location ?? undefined,
        });
      } catch (error) {
        log.warn(error, "rescheduleInterview: GCal event update failed");
      }
    } else {
      const gcalResult = await syncInterviewToGCal({
        workspaceId: workspace.id,
        interviewId: row!.id,
        summary:
          row?.title ??
          INTERVIEW_TYPE_LABEL[row?.type ?? "screening"] ??
          "Interview",
        start: when,
        durationMins: data.durationMins,
        attendees: attendees.length > 0 ? attendees : undefined,
        location: data.location ?? undefined,
        mode: info?.mode,
      });
      if (gcalResult && !gcalResult.ok) {
        log.warn(
          { reason: gcalResult.reason },
          "rescheduleInterview: GCal sync failed, event may be stale",
        );
      }
    }

    // Teams and Zoom meetings are standalone objects. Recreate them after
    // their old meeting is deleted so their provider never keeps stale time.
    const summary =
      row?.title ??
      INTERVIEW_TYPE_LABEL[row?.type ?? "screening"] ??
      "Interview";
    if (info?.mode === "video" && row?.teamsMeetingId) {
      await cancelInterviewTeamsMeeting({
        workspaceId: workspace.id,
        interviewId: row.id,
        teamsMeetingId: row.teamsMeetingId,
      });
      await syncInterviewToTeams({
        workspaceId: workspace.id,
        interviewId: row.id,
        summary,
        start: when,
        durationMins: data.durationMins,
      });
    } else if (info?.mode === "video" && row?.zoomMeetingId) {
      await cancelInterviewZoomMeeting({
        workspaceId: workspace.id,
        interviewId: row.id,
        zoomMeetingId: row.zoomMeetingId,
      });
      await syncInterviewToZoom({
        workspaceId: workspace.id,
        interviewId: row.id,
        summary,
        start: when,
        durationMins: data.durationMins,
      });
    }

    // Persist the new time/location only after the provider meeting was
    // successfully recreated, keeping DB and provider state consistent.
    // Only recompute the manual meetLink when no provider owns it , Zoom/Teams/
    // Jitsi write their own link and must not be overwritten from `location`.
    const hasProviderMeeting =
      Boolean(row.teamsMeetingId) ||
      Boolean(row.zoomMeetingId) ||
      Boolean(row.jitsiRoom);
    const rescheduleSet: Record<string, unknown> = {
      scheduledAt: when,
      durationMins: data.durationMins,
      location: data.location ?? null,
      updatedAt: new Date(),
    };
    if (!hasProviderMeeting) {
      rescheduleSet.meetLink = deriveMeetLink(row.mode, data.location);
    }
    let persistedEvent: PersistedDomainEvent | undefined;
    await db.transaction(async (tx) => {
      await tx
        .update(interviews)
        .set(rescheduleSet)
        .where(
          and(
            eq(interviews.id, data.interviewId),
            eq(interviews.workspaceId, workspace.id),
          ),
        );

      await tx.insert(candidatePortalNotifications).values({
        workspaceId: workspace.id,
        candidateId: data.candidateId,
        type: "interview_rescheduled",
        title: "Interview rescheduled",
        body: `Your interview is now scheduled for ${interviewWhenFormatter.format(when)}.`,
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
            candidateId: data.candidateId,
            scheduledAt: when.toISOString(),
            durationMins: data.durationMins,
            location: data.location ?? null,
          },
        },
      });
    });
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
      await queueInterviewEmail(
        workspace.id,
        "interview.rescheduled",
        {
          candidateEmail: info.email,
          candidateName: info.firstName,
          companyName: info.companyName,
          jobTitle: info.jobTitle,
          interviewType: INTERVIEW_TYPE_LABEL[info.type] ?? "Interview",
          scheduledAt: when.toISOString(),
          mode: INTERVIEW_MODE_LABEL[info.mode] ?? info.mode,
          location: deliveryLocation,
          durationMins: data.durationMins,
          replyTo,
        },
        user.id,
      );
    }

    revalidatePath(`/dashboard/candidates/${data.candidateId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendars");

    // Emit outbound webhook event.
    void emitWebhookEvent(workspace.id, "interview.rescheduled", {
      interview: {
        id: data.interviewId,
        candidateId: data.candidateId,
        scheduledAt: when.toISOString(),
        durationMins: data.durationMins,
        location: data.location ?? null,
      },
    }, { actorId: user.id, skipDomainEvent: true });

    return { success: true };
  } catch (error) {
    log.error(error, "rescheduleInterview failed");
    return {
      success: false,
      error: "Unable to reschedule interview.",
    };
  }
}

const updateSchema = z.object({
  interviewId: z.string().min(1),
  candidateId: z.string().min(1),
  type: z.enum(interviewTypes).optional(),
  mode: z.enum(interviewModes).optional(),
  scheduledAt: z
    .string()
    .refine(
      (value) => value === "" || !Number.isNaN(Date.parse(value)),
      "Invalid date/time.",
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
    }, "Invalid timezone.")
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

/**
 * Full edit: update any combination of interview fields. Syncs to GCal and
 * sends a rescheduled email when the date/time changes.
 */
export async function updateInterview(input: {
  interviewId: string;
  candidateId: string;
  type?: "screening" | "culture_fit" | "technical" | "onsite" | "final";
  mode?: "video" | "phone" | "onsite";
  scheduledAt?: string;
  timeZone?: string | null;
  durationMins?: number;
  interviewerId?: string | null;
  title?: string | null;
  location?: string | null;
  notes?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input.",
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
        error: "Interviewer must belong to this workspace.",
      };
    }

    // Parse the new time with the recruiter's timezone (same wall-clock
    // interpretation as scheduleInterview). Previously this used new Date()
    // directly, which interpreted naive strings as UTC and shifted the time.
    const when =
      data.scheduledAt && data.scheduledAt !== ""
        ? parseScheduledAt(data.scheduledAt, data.timeZone)
        : undefined;
    if (when && isPastWhen(when)) {
      return {
        success: false,
        error: "Interview time must be in the future.",
      };
    }

    // Build the update payload , only set fields that were explicitly provided.
    const set: Record<string, unknown> = { updatedAt: new Date() };
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
        gcalEventId: interviews.gcalEventId,
        teamsMeetingId: interviews.teamsMeetingId,
        zoomMeetingId: interviews.zoomMeetingId,
        jitsiRoom: interviews.jitsiRoom,
        location: interviews.location,
        scheduledAt: interviews.scheduledAt,
        durationMins: interviews.durationMins,
        type: interviews.type,
        mode: interviews.mode,
        title: interviews.title,
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
      return { success: false, error: "Interview not found." };
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
      .innerJoin(candidates, eq(candidates.id, interviews.candidateId))
      .innerJoin(jobs, eq(jobs.id, interviews.jobId))
      .innerJoin(organization, eq(organization.id, interviews.workspaceId))
      .where(
        and(
          eq(interviews.id, data.interviewId),
          eq(interviews.workspaceId, workspace.id),
        ),
      )
      .limit(1);

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
          error: "This interviewer already has an overlapping interview.",
        };
      }
    }

    // Sync to Google Calendar if the event was previously synced. Await so a
    // GCal failure is logged instead of silently leaving a stale event.
    if (row?.gcalEventId) {
      try {
        await updateInterviewGCalEvent({
          workspaceId: workspace.id,
          gcalEventId: row.gcalEventId,
          start: effectiveScheduledAt,
          durationMins: effectiveDurationMins,
          attendees: attendees.length > 0 ? attendees : undefined,
          location: data.location ?? undefined,
        });
      } catch (error) {
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
        INTERVIEW_TYPE_LABEL[data.type ?? row.type] ??
        "Interview";
      if (row.teamsMeetingId) {
        await cancelInterviewTeamsMeeting({
          workspaceId: workspace.id,
          interviewId: row.id,
          teamsMeetingId: row.teamsMeetingId,
        });
        if (effectiveMode === "video") {
          await syncInterviewToTeams({
            workspaceId: workspace.id,
            interviewId: row.id,
            summary,
            start,
            durationMins,
          });
        }
      } else if (row.zoomMeetingId) {
        await cancelInterviewZoomMeeting({
          workspaceId: workspace.id,
          interviewId: row.id,
          zoomMeetingId: row.zoomMeetingId,
        });
        if (effectiveMode === "video") {
          await syncInterviewToZoom({
            workspaceId: workspace.id,
            interviewId: row.id,
            summary,
            start,
            durationMins,
          });
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
          await syncInterviewToZoom({
            workspaceId: workspace.id,
            interviewId: row.id,
            summary,
            start,
            durationMins,
          });
        } else if (outlookConfig) {
          await syncInterviewToTeams({
            workspaceId: workspace.id,
            interviewId: row.id,
            summary,
            start,
            durationMins,
          });
        } else if (gcalConfig) {
          await syncInterviewToGCal({
            workspaceId: workspace.id,
            interviewId: row.id,
            summary,
            start,
            durationMins,
            attendees: attendees.length > 0 ? attendees : undefined,
            location: data.location ?? undefined,
            mode: "video",
          });
        } else if (jitsiConfig) {
          await syncInterviewToJitsi({
            workspaceId: workspace.id,
            interviewId: row.id,
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
    await db.transaction(async (tx) => {
      await tx
        .update(interviews)
        .set(set)
        .where(
          and(
            eq(interviews.id, data.interviewId),
            eq(interviews.workspaceId, workspace.id),
          ),
        );

      persistedEvent = await persistDomainEvent(tx, {
        workspaceId: workspace.id,
        name: "interview.rescheduled",
        aggregateType: "interview",
        aggregateId: data.interviewId,
        actorId: user.id,
        payload: {
          interview: {
            id: data.interviewId,
            candidateId: data.candidateId,
            scheduledAt: effectiveScheduledAt.toISOString(),
            durationMins: effectiveDurationMins,
            location: data.location ?? null,
          },
        },
      });
    });
    if (persistedEvent) await publishPersistedDomainEvents([persistedEvent]);

    // Send rescheduled email if date/time changed.
    if (data.scheduledAt && data.scheduledAt !== "" && info?.email) {
      const when = new Date(data.scheduledAt);
      const replyTo = await getInboundReplyTo(workspace.id, info.applicationId);
      await queueInterviewEmail(
        workspace.id,
        "interview.rescheduled",
        {
          candidateEmail: info.email,
          candidateName: info.firstName,
          companyName: info.companyName,
          jobTitle: info.jobTitle,
          interviewType:
            INTERVIEW_TYPE_LABEL[data.type ?? row.type] ?? "Interview",
          scheduledAt: when.toISOString(),
          mode: INTERVIEW_MODE_LABEL[effectiveMode] ?? effectiveMode,
          location: data.location ?? undefined,
          durationMins: effectiveDurationMins,
          replyTo,
        },
        user.id,
      );
    }

    revalidatePath(`/dashboard/candidates/${data.candidateId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendars");

    void emitWebhookEvent(workspace.id, "interview.rescheduled", {
      interview: {
        id: data.interviewId,
        candidateId: data.candidateId,
        scheduledAt: effectiveScheduledAt.toISOString(),
        durationMins: effectiveDurationMins,
        location: data.location ?? null,
      },
    }, { actorId: user.id, skipDomainEvent: true });

    return { success: true };
  } catch (error) {
    log.error(error, "updateInterview failed");
    return {
      success: false,
      error: "Unable to update interview.",
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
  const parsed = briefSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid interview." };
  }

  let context;
  try {
    context = await requirePermission("collab:write");
  } catch {
    return {
      success: false,
      error: "You do not have permission to generate briefs.",
    };
  }
  const workspaceId = context.organization.id;

  const aiConfig = await getWorkspaceAiConfig(workspaceId);
  if (!aiConfig) {
    return {
      success: false,
      error: "AI is not configured for this workspace.",
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
    .innerJoin(candidates, eq(candidates.id, interviews.candidateId))
    .innerJoin(jobs, eq(jobs.id, interviews.jobId))
    .where(
      and(
        eq(interviews.id, parsed.data.interviewId),
        eq(interviews.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!briefRow) {
    return { success: false, error: "Interview not found." };
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

  const candidateBlock = [
    `Name: ${briefRow.candidateFirst} ${briefRow.candidateLast}`,
    briefRow.candidateHeadline
      ? `Headline: ${briefRow.candidateHeadline}`
      : null,
    briefRow.candidateLocation
      ? `Location: ${briefRow.candidateLocation}`
      : null,
    briefRow.candidateExperienceYears != null
      ? `Experience: ${briefRow.candidateExperienceYears} years`
      : null,
    Array.isArray(briefRow.candidateSkills) &&
    (briefRow.candidateSkills as string[]).length > 0
      ? `Skills: ${(briefRow.candidateSkills as string[]).slice(0, 20).join(", ")}`
      : null,
    resumeText
      ? `Resume:\n"""\n${resumeText.slice(0, 8000)}\n"""`
      : "Resume: not available",
  ]
    .filter(Boolean)
    .join("\n");

  const jobBlock = [
    `Title: ${briefRow.jobTitle}`,
    `Description: ${stripHtml(briefRow.jobDescription).slice(0, 3000)}`,
    briefRow.jobRequirements
      ? `Requirements: ${stripHtml(briefRow.jobRequirements).slice(0, 1500)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const interviewBlock = [
    `Interview type: ${INTERVIEW_TYPE_LABEL[briefRow.type] ?? briefRow.type}`,
    `Duration: ${briefRow.durationMins} min`,
    briefRow.notes ? `Interviewer notes: ${briefRow.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { output: briefOutput } = await generateText({
      model: getModel(aiConfig),
      system:
        "You are an expert recruiter coach. Generate a focused pre-interview brief for " +
        "the interviewer. Be specific and practical. `candidateSummary` is 2-4 sentences. " +
        "`keyAreasToProbe` is 3-6 concise themes. `suggestedQuestions` is 4-8 concrete, " +
        "open-ended questions. `redFlags` lists concerns worth watching, leave empty when " +
        "there are none. Use plain text only, no markdown.",
      prompt:
        `Prepare an interview brief.\n\n## Candidate\n${candidateBlock}\n\n` +
        `## Job\n${jobBlock}\n\n## Interview\n${interviewBlock}`,
      output: Output.object({ schema: interviewBriefSchema }),
    });

    if (!briefOutput) {
      return { success: false, error: "AI returned no structured output." };
    }

    await db
      .update(interviews)
      .set({ briefContent: briefOutput, updatedAt: new Date() })
      .where(
        and(
          eq(interviews.id, parsed.data.interviewId),
          eq(interviews.workspaceId, workspaceId),
        ),
      );

    revalidatePath(`/dashboard/candidates/${briefRow.candidateId}`);
    return { success: true, brief: briefOutput };
  } catch (briefError) {
    log.error(briefError, "generateInterviewBriefAction failed");
    return {
      success: false,
      error:
        "Failed to generate brief. Check AI provider settings and try again.",
    };
  }
}

// ── Interview Notes Summarizer ───────────────────────────────────────────────

const summarizeSchema = z.object({
  interviewId: z.uuid(),
  rawNotes: z.string().trim().min(1, "Notes are required.").max(8000),
});

export type SummarizeInterviewNotesResult =
  | { success: true; summary: InterviewNotesSummary }
  | { success: false; error: string; reason?: "not_configured" };

/** Summarize raw post-interview notes into structured AI output (not persisted). */
export async function summarizeInterviewNotesAction(input: {
  interviewId: string;
  rawNotes: string;
}): Promise<SummarizeInterviewNotesResult> {
  const parsed = summarizeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  let context;
  try {
    context = await requirePermission("collab:write");
  } catch {
    return {
      success: false,
      error: "You do not have permission to summarize notes.",
    };
  }
  const workspaceId = context.organization.id;

  const aiConfig = await getWorkspaceAiConfig(workspaceId);
  if (!aiConfig) {
    return {
      success: false,
      error: "AI is not configured for this workspace.",
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
    .innerJoin(candidates, eq(candidates.id, interviews.candidateId))
    .innerJoin(jobs, eq(jobs.id, interviews.jobId))
    .where(
      and(
        eq(interviews.id, parsed.data.interviewId),
        eq(interviews.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!sumRow) {
    return { success: false, error: "Interview not found." };
  }

  try {
    const summary = await summarizeInterviewNotesWithAI(aiConfig, {
      rawNotes: parsed.data.rawNotes,
      candidateName: `${sumRow.candidateFirst} ${sumRow.candidateLast}`,
      jobTitle: sumRow.jobTitle,
      interviewType:
        sumRow.title ?? INTERVIEW_TYPE_LABEL[sumRow.type] ?? sumRow.type,
    });

    return { success: true, summary };
  } catch (sumError) {
    log.error(sumError, "summarizeInterviewNotesAction failed");
    return {
      success: false,
      error:
        "Failed to summarize notes. Check AI provider settings and try again.",
    };
  }
}
