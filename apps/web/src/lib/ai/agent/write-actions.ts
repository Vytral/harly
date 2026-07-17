"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import {
  moveApplicationStage,
  updateApplicationStatus,
} from "@/features/pipeline/actions";
import {
  completeMyOpenTasks,
  createTask,
  updateTask,
} from "@/features/tasks/actions";
import {
  createCandidateNote,
  addCandidateTag,
  createScorecard,
  sendCandidateMessage,
} from "@/features/candidates/actions";
import { createOffer, sendOffer, decideOffer } from "@/features/offers/actions";
import { scheduleInterview } from "@/features/interviews/actions";
import {
  addToPoolAction,
  assignFromPoolToJobAction,
} from "@/features/pool/actions";
import { isAgentWriteTool, type AgentWriteTool } from "./write-tool-names";
import { createJobForApi } from "@/features/jobs/service";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { logAuditEvent } from "@/lib/audit-log";

/**
 * Central dispatcher for Harly AI WRITE actions.
 *
 * Each write tool the agent can propose has NO server-side `execute` (see
 * write-tools.ts). The model emits the call, the panel renders a confirm card,
 * and on confirm the client calls `confirmAgentWriteAction(tool, input)` which
 * validates the input and runs the real, already-permission-checked server
 * action under the user's session.
 *
 * Adding a new write tool = add a zod schema + a handler entry here, and a tool
 * definition in write-tools.ts. The panel UI needs no change.
 */

type WriteResult = { success: boolean; error?: string; message?: string };

const moveStageSchema = z.object({
  applicationId: z.string().min(1),
  toStageId: z.string().min(1),
});

const rejectSchema = z.object({
  applicationId: z.string().min(1),
});

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional().transform((value) => value ?? undefined),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  dueDate: z.string().nullable().optional().transform((value) => value ?? undefined),
  candidateId: z.uuid().optional().nullable(),
  applicationId: z.uuid().optional().nullable(),
  jobId: z.uuid().optional().nullable(),
});

const updateTaskSchema = z.object({
  // The strict AI tool sends every update field, using null for fields the user
  // did not ask to change. Convert those nulls to undefined before forwarding
  // the update to the task action, where undefined means "leave unchanged".
  taskId: z.string().min(1).nullable().optional().transform((value) => value ?? undefined),
  // Older model turns used taskIds for a best-effort loop. Reject that shape so
  // no confirmation can silently turn into a partial batch operation.
  taskIds: z.undefined().optional(),
  status: z
    .enum(["pending", "in_progress", "completed", "canceled"])
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
  title: z.string().trim().min(1).max(200).nullable().optional().transform((value) => value ?? undefined),
  priority: z.enum(["low", "medium", "high", "urgent"]).nullable().optional().transform((value) => value ?? undefined),
  dueDate: z.string().nullable().optional().transform((value) => value ?? undefined),
  clearDueDate: z.boolean().optional().default(false),
  ownerId: z.string().min(1).nullable().optional().transform((value) => value ?? undefined),
});

const completeMyOpenTasksSchema = z.object({});

const createJobSchema = z.object({
  title: z.string().trim().min(3).max(200),
  jobSummary: z.string().trim().min(10).max(2000),
  sections: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        bullets: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
      }),
    )
    .min(2)
    .max(6),
  department: z.string().trim().max(120).nullable(),
  location: z.string().trim().max(200).nullable(),
  employmentType: z.enum(["full_time", "part_time", "contract", "internship"]),
  workplaceType: z.enum(["remote", "hybrid", "onsite"]),
  experienceLevel: z.string().trim().max(120).nullable(),
  keywords: z.array(z.string().trim().min(1).max(80)).max(20),
});

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function jobDraftToHtml(input: z.infer<typeof createJobSchema>): string {
  const sections = input.sections.map(
    (section) =>
      `<h2>${escapeHtml(section.title)}</h2><ul>${section.bullets
        .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
        .join("")}</ul>`,
  );
  return `<p>${escapeHtml(input.jobSummary)}</p>${sections.join("")}`;
}

const addNoteSchema = z.object({
  candidateId: z.string().min(1),
  body: z.string().trim().min(1).max(2000),
});

const addTagSchema = z.object({
  candidateId: z.string().min(1),
  label: z.string().trim().min(1).max(50),
});

const createOfferSchema = z.object({
  applicationId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  salaryAmount: z.number().nullable(),
  currency: z.string().max(8).nullable(),
  salaryPeriod: z.enum(["annual", "monthly"]).nullable(),
  equity: z.string().max(100).nullable(),
  startDate: z.string().nullable(),
  expiresAt: z.string().nullable(),
  notes: z.string().max(2000).nullable(),
});

const offerIdSchema = z.object({ offerId: z.string().min(1) });

const decideOfferSchema = z.object({
  offerId: z.string().min(1),
  decision: z.enum(["accepted", "declined"]),
});

const scheduleInterviewSchema = z.object({
  candidateId: z.string().min(1),
  applicationId: z.string().min(1),
  type: z.enum(["screening", "culture_fit", "technical", "onsite", "final"]),
  mode: z.enum(["video", "phone", "onsite"]),
  scheduledAt: z.string().min(1),
  durationMins: z.number().int().min(5).max(480).default(45),
  interviewerId: z.string().nullable(),
});

const addToPoolSchema = z.object({
  candidateId: z.string().min(1),
  source: z.enum(["applied", "imported", "sourced", "referred"]).nullable().optional().transform((value) => value ?? undefined),
  reason: z.string().max(500).nullable().optional().transform((value) => value ?? undefined),
});

const assignFromPoolSchema = z.object({
  candidateId: z.string().min(1),
  jobId: z.string().min(1),
});

const scorecardSchema = z.object({
  candidateId: z.string().min(1),
  rating: z.enum(["strong", "mixed", "weak"]),
  comment: z.string().max(2000).nullable().optional().transform((value) => value ?? undefined),
  stageName: z.string().max(100).optional().nullable(),
});

const sendEmailSchema = z.object({
  candidateId: z.string().min(1),
  toEmail: z.email(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
});

/**
 * Handlers receive the validated input + the resolved workspace/user context.
 * Each returns a normalized WriteResult.
 */
const HANDLERS = {
  moveCandidateStage: {
    schema: moveStageSchema,
    run: async (
      input: z.infer<typeof moveStageSchema>,
      ctx: { workspaceId: string },
    ): Promise<WriteResult> => {
      const res = await moveApplicationStage({
        applicationId: input.applicationId,
        fromStageId: null,
        toStageId: input.toStageId,
        workspaceId: ctx.workspaceId,
      });
      return {
        success: res.success,
        error: res.error,
        message: "Stage updated.",
      };
    },
  },

  rejectCandidate: {
    schema: rejectSchema,
    run: async (
      input: z.infer<typeof rejectSchema>,
      ctx: { workspaceId: string },
    ): Promise<WriteResult> => {
      const res = await updateApplicationStatus({
        applicationIds: [input.applicationId],
        workspaceId: ctx.workspaceId,
        status: "rejected",
      });
      return {
        success: res.success,
        error: res.error,
        message: "Candidate rejected.",
      };
    },
  },

  createTask: {
    schema: createTaskSchema,
    run: async (
      input: z.infer<typeof createTaskSchema>,
      ctx: { workspaceId: string; userId: string },
    ): Promise<WriteResult> => {
      const res = await createTask({
        title: input.title,
        description: input.description,
        priority: input.priority,
        status: "pending",
        dueDate: input.dueDate,
        // Default the owner to the current user when the agent doesn't specify one.
        ownerId: ctx.userId,
        candidateId: input.candidateId,
        applicationId: input.applicationId,
        jobId: input.jobId,
      });
      return {
        success: res.success,
        error: res.error,
        message: "Task created.",
      };
    },
  },

  updateTask: {
    schema: updateTaskSchema,
    run: async (
      input: z.infer<typeof updateTaskSchema>,
      ctx: { workspaceId: string; userId: string },
    ): Promise<WriteResult> => {
      void ctx;
      if (!input.taskId) {
        return { success: false, error: "No task specified." };
      }
      const hasField =
        input.status !== undefined ||
        input.title !== undefined ||
        input.priority !== undefined ||
        input.dueDate !== undefined ||
        input.ownerId !== undefined ||
        input.clearDueDate;
      if (!hasField) {
        return { success: false, error: "Nothing to change." };
      }

      const res = await updateTask({
        taskId: input.taskId,
        status: input.status,
        title: input.title,
        priority: input.priority,
        dueDate: input.clearDueDate ? "" : input.dueDate,
        ownerId: input.ownerId,
      });
      return {
        success: res.success,
        error: res.error,
        message: "Task updated.",
      };
    },
  },

  completeMyOpenTasks: {
    schema: completeMyOpenTasksSchema,
    run: async (): Promise<WriteResult> => {
      const res = await completeMyOpenTasks();
      if (!res.success) {
        return { success: false, error: res.error };
      }
      return {
        success: true,
        message:
          res.updatedCount === 1
            ? "Completed 1 open task assigned to you."
            : `Completed ${res.updatedCount ?? 0} open tasks assigned to you.`,
      };
    },
  },

  createJob: {
    schema: createJobSchema,
    run: async (
      input: z.infer<typeof createJobSchema>,
      ctx: { workspaceId: string; userId: string },
    ): Promise<WriteResult> => {
      const permission = await requirePermission("jobs:create");
      if (permission.organization.id !== ctx.workspaceId) {
        return {
          success: false,
          error: "Workspace changed. Please try again.",
        };
      }

      const job = await createJobForApi({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        values: {
          title: input.title,
          description: jobDraftToHtml(input),
          department: input.department,
          location: input.location,
          employmentType: input.employmentType,
          workplaceType: input.workplaceType,
          experienceLevel: input.experienceLevel,
          keywords: input.keywords,
          status: "draft",
        },
      });

      await logAuditEvent({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        actorEmail: permission.user.email,
        action: "job.created",
        resourceType: "job",
        resourceId: job.id,
        severity: "info",
        metadata: { title: job.title, slug: job.slug, source: "harly_ai" },
      });
      revalidatePath("/dashboard/jobs");
      return { success: true, message: `Draft job created: ${job.title}.` };
    },
  },

  addCandidateNote: {
    schema: addNoteSchema,
    run: async (
      input: z.infer<typeof addNoteSchema>,
      ctx: { workspaceId: string },
    ): Promise<WriteResult> => {
      const res = await createCandidateNote({
        candidateId: input.candidateId,
        workspaceId: ctx.workspaceId,
        body: input.body,
      });
      return { success: res.success, error: res.error, message: "Note added." };
    },
  },

  addCandidateTag: {
    schema: addTagSchema,
    run: async (
      input: z.infer<typeof addTagSchema>,
      ctx: { workspaceId: string },
    ): Promise<WriteResult> => {
      const res = await addCandidateTag({
        candidateId: input.candidateId,
        workspaceId: ctx.workspaceId,
        label: input.label,
      });
      return { success: res.success, error: res.error, message: "Tag added." };
    },
  },

  createOffer: {
    schema: createOfferSchema,
    run: async (
      input: z.infer<typeof createOfferSchema>,
    ): Promise<WriteResult> => {
      const res = await createOffer({
        applicationId: input.applicationId,
        title: input.title,
        salaryAmount: input.salaryAmount,
        currency: input.currency,
        salaryPeriod: input.salaryPeriod,
        equity: input.equity,
        startDate: input.startDate,
        expiresAt: input.expiresAt,
        notes: input.notes,
      });
      return {
        success: res.success,
        error: res.error,
        message: "Offer drafted.",
      };
    },
  },

  sendOffer: {
    schema: offerIdSchema,
    run: async (input: z.infer<typeof offerIdSchema>): Promise<WriteResult> => {
      const res = await sendOffer({ offerId: input.offerId });
      return { success: res.success, error: res.error, message: "Offer sent." };
    },
  },

  decideOffer: {
    schema: decideOfferSchema,
    run: async (
      input: z.infer<typeof decideOfferSchema>,
    ): Promise<WriteResult> => {
      const res = await decideOffer({
        offerId: input.offerId,
        decision: input.decision,
      });
      return {
        success: res.success,
        error: res.error,
        message: `Offer marked ${input.decision}.`,
      };
    },
  },

  scheduleInterview: {
    schema: scheduleInterviewSchema,
    run: async (
      input: z.infer<typeof scheduleInterviewSchema>,
      ctx: { workspaceId: string },
    ): Promise<WriteResult> => {
      const res = await scheduleInterview({
        workspaceId: ctx.workspaceId,
        candidateId: input.candidateId,
        applicationId: input.applicationId,
        type: input.type,
        mode: input.mode,
        scheduledAt: input.scheduledAt,
        durationMins: input.durationMins,
        interviewerId: input.interviewerId ?? "",
      });
      return {
        success: res.success,
        error: res.error,
        message: "Interview scheduled.",
      };
    },
  },

  addToTalentPool: {
    schema: addToPoolSchema,
    run: async (
      input: z.infer<typeof addToPoolSchema>,
    ): Promise<WriteResult> => {
      const res = await addToPoolAction({
        candidateId: input.candidateId,
        source: input.source,
        reason: input.reason,
      });
      return {
        success: res.success,
        error: res.success ? undefined : res.error,
        message: "Added to talent pool.",
      };
    },
  },

  assignFromPoolToJob: {
    schema: assignFromPoolSchema,
    run: async (
      input: z.infer<typeof assignFromPoolSchema>,
    ): Promise<WriteResult> => {
      const res = await assignFromPoolToJobAction({
        candidateId: input.candidateId,
        jobId: input.jobId,
      });
      return {
        success: res.success,
        error: res.success ? undefined : res.error,
        message: "Assigned to job.",
      };
    },
  },

  createScorecard: {
    schema: scorecardSchema,
    run: async (
      input: z.infer<typeof scorecardSchema>,
      ctx: { workspaceId: string },
    ): Promise<WriteResult> => {
      const res = await createScorecard({
        candidateId: input.candidateId,
        workspaceId: ctx.workspaceId,
        rating: input.rating,
        comment: input.comment,
        stageName: input.stageName,
      });
      return {
        success: res.success,
        error: res.error,
        message: "Scorecard added.",
      };
    },
  },

  sendCandidateEmail: {
    schema: sendEmailSchema,
    run: async (
      input: z.infer<typeof sendEmailSchema>,
      ctx: { workspaceId: string },
    ): Promise<WriteResult> => {
      const res = await sendCandidateMessage({
        candidateId: input.candidateId,
        workspaceId: ctx.workspaceId,
        toEmail: input.toEmail,
        subject: input.subject,
        body: input.body,
      });
      return { success: res.success, error: res.error, message: "Email sent." };
    },
  },
} as const;

// Compile-time guard: HANDLERS keys must exactly match the client-safe registry
// in write-tool-names.ts. If they drift, this assignment fails to type-check.
const _handlerKeysMatchRegistry: Record<AgentWriteTool, unknown> = HANDLERS;
void _handlerKeysMatchRegistry;

/**
 * Invoked from the chat panel when the user CONFIRMS a write the agent proposed.
 * Resolves the workspace from the session, validates the input against the
 * tool's schema, and runs the underlying server action.
 */
export async function confirmAgentWriteAction(
  tool: string,
  rawInput: unknown,
): Promise<WriteResult> {
  if (!isAgentWriteTool(tool)) {
    return { success: false, error: "Unknown action." };
  }

  const context = await getWorkspaceContextOrNull();
  if (!context) {
    return { success: false, error: "Not signed in." };
  }

  const handler = HANDLERS[tool];
  const parsed = handler.schema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    // The handler union is keyed by `tool`; the validated input matches its
    // schema. TS can't correlate the two across the union, so cast at the call.
    const run = handler.run as (
      input: unknown,
      ctx: { workspaceId: string; userId: string },
    ) => Promise<WriteResult>;
    return await run(parsed.data, {
      workspaceId: context.organization.id,
      userId: context.user.id,
    });
  } catch (error) {
    console.error(`Agent write '${tool}' failed`, error);
    return { success: false, error: "The action failed. Please try again." };
  }
}
