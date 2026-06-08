"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@harly/db";
import { activityEvents, applications, candidates, interviews } from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";

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

      return { success: true as const };
    });

    if (result.success) {
      revalidatePath(`/dashboard/candidates/${data.candidateId}`);
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/calendars");
    }

    return result;
  } catch (error) {
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
      .returning({ id: interviews.id });

    if (updated.length === 0) {
      return { success: false, error: "Interview not found." };
    }

    revalidatePath(`/dashboard/candidates/${parsed.data.candidateId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendars");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: "Unable to update interview.",
    };
  }
}
