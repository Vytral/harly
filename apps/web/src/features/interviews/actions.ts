"use server";

import { revalidatePath } from "next/cache";
import { createElement } from "react";
import { and, desc, eq } from "drizzle-orm";
import { Output, generateText } from "ai";
import { z } from "zod";

import { db } from "@harly/db";
import {
  activityEvents,
  applications,
  candidateFiles,
  candidates,
  interviews,
  jobs,
  organization,
  user as authUsers,
} from "@harly/db";
import {
  InterviewCanceled,
  interviewCanceledSubject,
  InterviewRescheduled,
  interviewRescheduledSubject,
  InterviewScheduled,
  interviewScheduledSubject,
} from "@harly/emails";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { sendWorkspaceEmail } from "@/lib/email";
import { getWorkspaceEmailBranding } from "@/lib/email/branding";
import { syncInterviewToGCal, cancelInterviewGCalEvent, updateInterviewGCalEvent } from "@/lib/gcal/sync";
import { emitWebhookEvent } from "@/server/webhooks/emit";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { getModel } from "@/lib/ai/registry";
import {
  interviewBriefSchema,
  interviewNotesSummarySchema,
  type InterviewBrief,
  type InterviewNotesSummary,
} from "@/lib/ai/schemas";
import { createLogger } from "@/lib/logger";
import { extractResumeText } from "@/lib/resume/extract-text";
import { resumeKeyFromUrl } from "@/lib/resume/storage-key";
import { storage } from "@/lib/storage";
import { maxResumeFileSize } from "@/lib/storage-validation";

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

const scheduleSchema = z.object({
  workspaceId: z.string().min(1),
  candidateId: z.string().min(1),
  applicationId: z.string().min(1, "Pick which application this interview is for."),
  type: z.enum(interviewTypes),
  mode: z.enum(interviewModes),
  // Local datetime-string from the form (YYYY-MM-DDTHH:mm). Parsed to a Date below.
  scheduledAt: z
    .string()
    .min(1, "Pick a date and time.")
    .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date/time."),
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
});

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
};

/**
 * Create a real interview row (not a fake note). Resolves the job from the
 * application, writes the interview, and logs an activity event so it surfaces
 * in the candidate timeline and the dashboard agenda.
 */
export async function scheduleInterview(
  input: ScheduleInterviewInput,
): Promise<{ success: boolean; error?: string }> {
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

    const data = parsed.data;
    const when = new Date(data.scheduledAt);

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

      return { success: true as const, interviewId: interview.id };
    });

    if (result.success) {
      // Resolve participant emails for GCal attendees + candidate notification.
      const [recipient] = await db
        .select({
          email: candidates.email,
          firstName: candidates.firstName,
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
      if (data.interviewerId) {
        const [interviewer] = await db
          .select({ email: authUsers.email })
          .from(authUsers)
          .where(eq(authUsers.id, data.interviewerId))
          .limit(1);
        interviewerEmail = interviewer?.email ?? undefined;
      }

      const attendees = [recipient?.email, interviewerEmail].filter(
        (e): e is string => Boolean(e),
      );

      // Sync to Google Calendar (fire-and-forget).
      // Google sends official calendar invitations to all attendees.
      void syncInterviewToGCal({
        workspaceId: workspace.id,
        interviewId: result.interviewId,
        summary: data.title ?? INTERVIEW_TYPE_LABEL[data.type] ?? "Interview",
        description: data.notes ?? undefined,
        start: when,
        durationMins: data.durationMins,
        attendees: attendees.length > 0 ? attendees : undefined,
        location: data.location ?? undefined,
      });

      if (recipient?.email) {
        const branding = await getWorkspaceEmailBranding(workspace.id);
        void sendWorkspaceEmail(workspace.id, {
          to: recipient.email,
          subject: interviewScheduledSubject({
            companyName: recipient.companyName,
            jobTitle: recipient.jobTitle,
          }),
          react: createElement(InterviewScheduled, {
            candidateName: recipient.firstName,
            companyName: recipient.companyName,
            companyLogoUrl: branding.logoUrl ?? undefined,
            accentColor: branding.primaryColor ?? undefined,
            socialLinks: branding.socialLinks,
            jobTitle: recipient.jobTitle,
            interviewType: INTERVIEW_TYPE_LABEL[data.type] ?? "Interview",
            when: interviewWhenFormatter.format(when),
            mode: INTERVIEW_MODE_LABEL[data.mode] ?? data.mode,
            location: data.location ?? undefined,
            duration: data.durationMins ? `${data.durationMins} min` : undefined,
            startIso: when.toISOString(),
            durationMins: data.durationMins,
            notes: data.notes ?? undefined,
          }),
        });
      }

      revalidatePath(`/dashboard/candidates/${data.candidateId}`);
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/calendars");

      // Emit outbound webhook event.
      void emitWebhookEvent(workspace.id, "interview.scheduled", {
        interviewId: result.interviewId,
        candidateId: data.candidateId,
        applicationId: data.applicationId,
        type: data.type,
        mode: data.mode,
        scheduledAt: when.toISOString(),
        durationMins: data.durationMins,
        location: data.location,
        interviewerId: data.interviewerId,
      });
    }

    return result;
  } catch {
    return {
      success: false,
      error: "Unable to schedule interview.",
    };
  }
}

const statusSchema = z.object({
  interviewId: z.string().min(1),
  candidateId: z.string().min(1),
  status: z.enum(["scheduled", "completed", "canceled"]),
});

/** Mark an interview completed or canceled from the candidate profile. */
export async function setInterviewStatus(input: {
  interviewId: string;
  candidateId: string;
  status: "scheduled" | "completed" | "canceled";
}): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = statusSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid request." };
    }
    const { organization: workspace } = await getWorkspaceContext();

    const updated = await db
      .update(interviews)
      .set({ status: parsed.data.status })
      .where(
        and(
          eq(interviews.id, parsed.data.interviewId),
          eq(interviews.workspaceId, workspace.id),
        ),
      )
      .returning({ id: interviews.id, gcalEventId: interviews.gcalEventId });

    if (updated.length === 0) {
      return { success: false, error: "Interview not found." };
    }

    if (parsed.data.status === "canceled" && updated[0]?.gcalEventId) {
      void cancelInterviewGCalEvent({
        workspaceId: workspace.id,
        interviewId: parsed.data.interviewId,
        gcalEventId: updated[0].gcalEventId,
      });
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
        const branding = await getWorkspaceEmailBranding(workspace.id);
        void sendWorkspaceEmail(workspace.id, {
          to: info.email,
          subject: interviewCanceledSubject({
            companyName: info.companyName,
            jobTitle: info.jobTitle,
          }),
          react: createElement(InterviewCanceled, {
            candidateName: info.firstName,
            companyName: info.companyName,
            companyLogoUrl: branding.logoUrl ?? undefined,
            accentColor: branding.primaryColor ?? undefined,
            socialLinks: branding.socialLinks,
            jobTitle: info.jobTitle,
            interviewType: INTERVIEW_TYPE_LABEL[info.type] ?? "Interview",
            when: info.scheduledAt ? interviewWhenFormatter.format(info.scheduledAt) : undefined,
          }),
        });
      }
    }

    revalidatePath(`/dashboard/candidates/${parsed.data.candidateId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendars");

    // Emit outbound webhook event.
    if (parsed.data.status === "canceled") {
      void emitWebhookEvent(workspace.id, "interview.canceled", {
        interviewId: parsed.data.interviewId,
        candidateId: parsed.data.candidateId,
      });
    } else if (parsed.data.status === "completed") {
      void emitWebhookEvent(workspace.id, "interview.completed", {
        interviewId: parsed.data.interviewId,
        candidateId: parsed.data.candidateId,
      });
    }

    return { success: true };
  } catch {
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

    const { organization: workspace } = await getWorkspaceContext();
    const data = parsed.data;
    const when = new Date(data.scheduledAt);

    const updated = await db
      .update(interviews)
      .set({
        scheduledAt: when,
        durationMins: data.durationMins,
        location: data.location ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(interviews.id, data.interviewId),
          eq(interviews.workspaceId, workspace.id),
        ),
      )
      .returning({
        id: interviews.id,
        gcalEventId: interviews.gcalEventId,
        title: interviews.title,
        type: interviews.type,
      });

    if (updated.length === 0) {
      return { success: false, error: "Interview not found." };
    }

    const row = updated[0];

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
    const attendees = [info?.email, interviewerEmail].filter(
      (e): e is string => Boolean(e),
    );

    // Sync to Google Calendar if the event was previously synced.
    if (row?.gcalEventId) {
      void updateInterviewGCalEvent({
        workspaceId: workspace.id,
        gcalEventId: row.gcalEventId,
        start: when,
        durationMins: data.durationMins,
        attendees: attendees.length > 0 ? attendees : undefined,
        location: data.location ?? undefined,
      });
    } else {
      void syncInterviewToGCal({
        workspaceId: workspace.id,
        interviewId: row!.id,
        summary: row?.title ?? INTERVIEW_TYPE_LABEL[row?.type ?? "screening"] ?? "Interview",
        start: when,
        durationMins: data.durationMins,
        attendees: attendees.length > 0 ? attendees : undefined,
        location: data.location ?? undefined,
      });
    }

    if (info?.email) {
      const branding = await getWorkspaceEmailBranding(workspace.id);
      void sendWorkspaceEmail(workspace.id, {
        to: info.email,
        subject: interviewRescheduledSubject({
          companyName: info.companyName,
          jobTitle: info.jobTitle,
        }),
        react: createElement(InterviewRescheduled, {
          candidateName: info.firstName,
          companyName: info.companyName,
          companyLogoUrl: branding.logoUrl ?? undefined,
          accentColor: branding.primaryColor ?? undefined,
          socialLinks: branding.socialLinks,
          jobTitle: info.jobTitle,
          interviewType: INTERVIEW_TYPE_LABEL[info.type] ?? "Interview",
          when: interviewWhenFormatter.format(when),
          mode: INTERVIEW_MODE_LABEL[info.mode] ?? info.mode,
          location: data.location ?? undefined,
          duration: data.durationMins ? `${data.durationMins} min` : undefined,
          startIso: when.toISOString(),
          durationMins: data.durationMins,
        }),
      });
    }

    revalidatePath(`/dashboard/candidates/${data.candidateId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendars");

    // Emit outbound webhook event.
    void emitWebhookEvent(workspace.id, "interview.rescheduled", {
      interviewId: data.interviewId,
      candidateId: data.candidateId,
      scheduledAt: when.toISOString(),
      durationMins: data.durationMins,
      location: data.location,
    });

    return { success: true };
  } catch {
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
    .refine((value) => value === "" || !Number.isNaN(Date.parse(value)), "Invalid date/time.")
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

    const { organization: workspace } = await getWorkspaceContext();
    const data = parsed.data;

    // Build the update payload — only set fields that were explicitly provided.
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (data.type !== undefined) set.type = data.type;
    if (data.mode !== undefined) set.mode = data.mode;
    if (data.title !== undefined) set.title = data.title;
    if (data.interviewerId !== undefined) set.interviewerId = data.interviewerId;
    if (data.location !== undefined) set.location = data.location;
    if (data.notes !== undefined) set.notes = data.notes;
    if (data.durationMins !== undefined) set.durationMins = data.durationMins;
    if (data.scheduledAt !== undefined && data.scheduledAt !== "") {
      set.scheduledAt = new Date(data.scheduledAt);
    }

    const updated = await db
      .update(interviews)
      .set(set)
      .where(
        and(
          eq(interviews.id, data.interviewId),
          eq(interviews.workspaceId, workspace.id),
        ),
      )
      .returning({
        id: interviews.id,
        gcalEventId: interviews.gcalEventId,
        scheduledAt: interviews.scheduledAt,
        type: interviews.type,
        mode: interviews.mode,
      });

    if (updated.length === 0) {
      return { success: false, error: "Interview not found." };
    }

    const row = updated[0];

    // Fetch full context for GCal sync and email.
    const [info] = await db
      .select({
        email: candidates.email,
        firstName: candidates.firstName,
        companyName: organization.name,
        jobTitle: jobs.title,
        interviewerId: interviews.interviewerId,
        scheduledAt: interviews.scheduledAt,
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
    const attendees = [info?.email, interviewerEmail].filter(
      (e): e is string => Boolean(e),
    );

    // Sync to Google Calendar if the event was previously synced.
    if (row?.gcalEventId) {
      void updateInterviewGCalEvent({
        workspaceId: workspace.id,
        gcalEventId: row.gcalEventId,
        start: info?.scheduledAt ?? new Date(),
        durationMins: data.durationMins ?? 45,
        attendees: attendees.length > 0 ? attendees : undefined,
        location: data.location ?? undefined,
      });
    }

    // Send rescheduled email if date/time changed.
    if (data.scheduledAt && data.scheduledAt !== "" && info?.email) {
      const when = new Date(data.scheduledAt);
      const branding = await getWorkspaceEmailBranding(workspace.id);
      void sendWorkspaceEmail(workspace.id, {
        to: info.email,
        subject: interviewRescheduledSubject({
          companyName: info.companyName,
          jobTitle: info.jobTitle,
        }),
        react: createElement(InterviewRescheduled, {
          candidateName: info.firstName,
          companyName: info.companyName,
          companyLogoUrl: branding.logoUrl ?? undefined,
          accentColor: branding.primaryColor ?? undefined,
          socialLinks: branding.socialLinks,
          jobTitle: info.jobTitle,
          interviewType: INTERVIEW_TYPE_LABEL[data.type ?? row?.type ?? "screening"] ?? "Interview",
          when: interviewWhenFormatter.format(when),
          mode: INTERVIEW_MODE_LABEL[data.mode ?? row?.mode ?? "video"] ?? "Video call",
          location: data.location ?? undefined,
          duration: data.durationMins ? `${data.durationMins} min` : undefined,
          startIso: when.toISOString(),
          durationMins: data.durationMins ?? 45,
        }),
      });
    }

    revalidatePath(`/dashboard/candidates/${data.candidateId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendars");

    void emitWebhookEvent(workspace.id, "interview.rescheduled", {
      interviewId: data.interviewId,
      candidateId: data.candidateId,
      scheduledAt: info?.scheduledAt?.toISOString(),
      durationMins: data.durationMins,
      location: data.location,
    });

    return { success: true };
  } catch {
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
    return { success: false, error: "You do not have permission to generate briefs." };
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
    .select({ fileName: candidateFiles.fileName, fileUrl: candidateFiles.fileUrl })
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
          const { text } = await extractResumeText({ buffer, fileName: resumeFile.fileName });
          resumeText = text.trim() || null;
        }
      } catch {
        // Resume unavailable — proceed without it.
      }
    }
  }

  function stripHtml(html: string | null): string {
    if (!html) return "";
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  const candidateBlock = [
    `Name: ${briefRow.candidateFirst} ${briefRow.candidateLast}`,
    briefRow.candidateHeadline ? `Headline: ${briefRow.candidateHeadline}` : null,
    briefRow.candidateLocation ? `Location: ${briefRow.candidateLocation}` : null,
    briefRow.candidateExperienceYears != null
      ? `Experience: ${briefRow.candidateExperienceYears} years`
      : null,
    Array.isArray(briefRow.candidateSkills) && (briefRow.candidateSkills as string[]).length > 0
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
        "open-ended questions. `redFlags` lists concerns worth watching — leave empty when " +
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
      error: "Failed to generate brief. Check AI provider settings and try again.",
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
    return { success: false, error: "You do not have permission to summarize notes." };
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
    const { output: sumOutput } = await generateText({
      model: getModel(aiConfig),
      system:
        "You are a recruiting analyst. Summarize post-interview notes into a structured " +
        "debrief. `executiveSummary` is 2-3 plain sentences. `positiveSignals` and " +
        "`concerns` are concise bullet phrases derived strictly from the notes — do not " +
        "invent information. `suggestedDecision` reflects the overall sentiment: " +
        "strong_yes / yes / maybe / no. Use plain text only, no markdown.",
      prompt:
        `Summarize these interview notes.\n\n` +
        `Candidate: ${sumRow.candidateFirst} ${sumRow.candidateLast}\n` +
        `Role: ${sumRow.jobTitle}\n` +
        `Interview: ${sumRow.title ?? INTERVIEW_TYPE_LABEL[sumRow.type] ?? sumRow.type}\n\n` +
        `Notes:\n"""\n${parsed.data.rawNotes.slice(0, 8000)}\n"""`,
      output: Output.object({ schema: interviewNotesSummarySchema }),
    });

    if (!sumOutput) {
      return { success: false, error: "AI returned no structured output." };
    }

    return { success: true, summary: sumOutput };
  } catch (sumError) {
    log.error(sumError, "summarizeInterviewNotesAction failed");
    return {
      success: false,
      error: "Failed to summarize notes. Check AI provider settings and try again.",
    };
  }
}