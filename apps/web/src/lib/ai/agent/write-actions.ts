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
  deleteTask,
  updateTask,
} from "@/features/tasks/actions";
import {
  createCandidateNote,
  addCandidateTag,
  createScorecard,
  sendCandidateMessage,
} from "@/features/candidates/actions";
import { createOffer, sendOffer, decideOffer } from "@/features/offers/actions";
import {
  scheduleInterview,
  setInterviewStatus,
} from "@/features/interviews/actions";
import {
  addToPoolAction,
  assignFromPoolToJobAction,
} from "@/features/pool/actions";
import { isAgentWriteTool, type AgentWriteTool } from "./write-tool-names";
import { createJobForApi } from "@/features/jobs/service";
import { getApplicationForApi } from "@/features/applications/service";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { logAuditEvent } from "@/lib/audit-log";
import {
  getAgentActionReceipt,
  parseAgentActionUndo,
  reserveAgentAction,
  type ActionReceiptResult,
} from "./action-receipts";

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

type WriteResult = ActionReceiptResult;

function auditResource(input: Record<string, unknown>) {
  const candidates = [
    ["application", input.applicationId],
    ["candidate", input.candidateId],
    ["job", input.jobId],
    ["task", input.taskId],
    ["offer", input.offerId],
  ] as const;
  for (const [resourceType, value] of candidates) {
    if (typeof value === "string" && value) {
      return { resourceType, resourceId: value };
    }
  }
  return {};
}

async function logConfirmedAgentWrite(input: {
  workspaceId: string;
  actorId: string;
  actorEmail?: string;
  toolName: string;
  actionId?: string;
  receiptId?: string;
  result: WriteResult;
  replayed?: boolean;
  normalizedInput: Record<string, unknown>;
}) {
  await logAuditEvent({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    action: input.replayed ? "ai.write_action.replayed" : "ai.write_action.confirmed",
    ...auditResource(input.normalizedInput),
    metadata: {
      toolName: input.toolName,
      actionId: input.actionId ?? null,
      receiptId: input.receiptId ?? null,
      success: input.result.success,
      // Deliberately omit email bodies, notes, prompts, and generated prose.
      source: "harly_ai",
    },
    severity: input.result.success ? "info" : "warning",
  });
}

const moveStageSchema = z.object({
  applicationId: z.string().min(1),
  toStageId: z.string().min(1),
});

const rejectSchema = z.object({
  applicationId: z.string().min(1),
});

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  dueDate: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
  candidateId: z.uuid().optional().nullable(),
  applicationId: z.uuid().optional().nullable(),
  jobId: z.uuid().optional().nullable(),
});

const updateTaskSchema = z.object({
  // The strict AI tool sends every update field, using null for fields the user
  // did not ask to change. Convert those nulls to undefined before forwarding
  // the update to the task action, where undefined means "leave unchanged".
  taskId: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
  // Older model turns used taskIds for a best-effort loop. Reject that shape so
  // no confirmation can silently turn into a partial batch operation.
  taskIds: z.undefined().optional(),
  status: z
    .enum(["pending", "in_progress", "completed", "canceled"])
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
  title: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
  priority: z
    .enum(["low", "medium", "high", "urgent"])
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
  dueDate: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
  clearDueDate: z.boolean().optional().default(false),
  ownerId: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
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
  timeZone: z.string().trim().max(80).nullable().optional(),
  durationMins: z.number().int().min(5).max(480).default(45),
  interviewerId: z.string().nullable(),
  title: z.string().trim().max(120).nullable().optional(),
  location: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  meetingProvider: z
    .enum(["auto", "google_meet", "zoom", "teams", "jitsi", "external"])
    .default("auto"),
});

/** Models can carry the sentence's final full stop into a structured title. */
function normalizeInterviewTitle(title: string | null | undefined) {
  if (!title) return title;
  const trimmed = title.trim();
  if (
    trimmed.endsWith(".") &&
    !trimmed.slice(0, -1).includes(".") &&
    /[A-Za-zÀ-ÿ)]$/.test(trimmed.slice(0, -1))
  ) {
    return trimmed.slice(0, -1).trimEnd();
  }
  return trimmed;
}

const addToPoolSchema = z.object({
  candidateId: z.string().min(1),
  source: z
    .enum(["applied", "imported", "sourced", "referred"])
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
  reason: z
    .string()
    .max(500)
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
});

const assignFromPoolSchema = z.object({
  candidateId: z.string().min(1),
  jobId: z.string().min(1),
});

const scorecardSchema = z.object({
  candidateId: z.string().min(1),
  applicationId: z.string().uuid(),
  stageId: z.string().uuid().nullable().optional(),
  rating: z.enum(["strong", "mixed", "weak"]),
  comment: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
});

const sendEmailSchema = z.object({
  candidateId: z.string().min(1),
  toEmail: z.email(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
});

const undoAgentActionSchema = z.object({
  receiptId: z.string().trim().min(1),
});

/**
 * Handlers receive the validated input + the resolved workspace/user context.
 * Each returns a normalized WriteResult.
 */
const HANDLERS = {
  undoAgentAction: {
    schema: undoAgentActionSchema,
    run: async (
      input: z.infer<typeof undoAgentActionSchema>,
    ): Promise<WriteResult> => undoAgentWriteAction(input.receiptId),
  },

  moveCandidateStage: {
    schema: moveStageSchema,
    run: async (
      input: z.infer<typeof moveStageSchema>,
      ctx: { workspaceId: string },
    ): Promise<WriteResult> => {
      const before = await getApplicationForApi({
        applicationId: input.applicationId,
        workspaceId: ctx.workspaceId,
      });
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
        ...(res.success && before.currentStageId
          ? {
              undo: {
                kind: "moveCandidateStage" as const,
                applicationId: input.applicationId,
                expectedCurrentStageId: input.toStageId,
                previousStageId: before.currentStageId,
              },
            }
          : {}),
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
        ...(res.success && res.taskId && res.updatedAt
          ? {
              undo: {
                kind: "deleteTask" as const,
                taskId: res.taskId,
                expectedUpdatedAt: res.updatedAt,
              },
            }
          : {}),
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
        timeZone: input.timeZone,
        durationMins: input.durationMins,
        interviewerId: input.interviewerId ?? "",
        title: normalizeInterviewTitle(input.title),
        location: input.location,
        notes: input.notes,
        meetingProvider: input.meetingProvider,
      });
      return {
        success: res.success,
        error: res.error,
        message: res.warning
          ? `Interview scheduled. ${res.warning}`
          : "Interview scheduled.",
        ...(res.success && res.interviewId
          ? {
              undo: {
                kind: "cancelInterview" as const,
                interviewId: res.interviewId,
                candidateId: input.candidateId,
                expectedStatus: "scheduled" as const,
              },
            }
          : {}),
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
        applicationId: input.applicationId,
        stageId: input.stageId,
        rating: input.rating,
        comment: input.comment,
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
  actionId?: string,
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

  const receipt = actionId
    ? await reserveAgentAction({
        workspaceId: context.organization.id,
        actorId: context.user.id,
        actionId,
        toolName: tool,
        normalizedInput: parsed.data,
      })
    : null;

  if (receipt?.kind === "replay") {
    const result = { ...receipt.result, replayed: true, receiptId: receipt.receiptId };
    await logConfirmedAgentWrite({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: "email" in context.user && typeof context.user.email === "string" ? context.user.email : undefined,
      toolName: tool,
      actionId,
      receiptId: receipt.receiptId,
      result,
      replayed: true,
      normalizedInput: parsed.data,
    });
    return result;
  }
  if (receipt?.kind === "conflict") {
    return { success: false, error: receipt.error };
  }

  try {
    // The handler union is keyed by `tool`; the validated input matches its
    // schema. TS can't correlate the two across the union, so cast at the call.
    const run = handler.run as (
      input: unknown,
      ctx: { workspaceId: string; userId: string },
    ) => Promise<WriteResult>;
    const result = await run(parsed.data, {
      workspaceId: context.organization.id,
      userId: context.user.id,
    });
    if (receipt?.kind === "reserved") {
      await receipt.complete(result);
      const completed = { ...result, receiptId: receipt.receiptId };
      await logConfirmedAgentWrite({
        workspaceId: context.organization.id,
        actorId: context.user.id,
        actorEmail: "email" in context.user && typeof context.user.email === "string" ? context.user.email : undefined,
        toolName: tool,
        actionId,
        receiptId: receipt.receiptId,
        result: completed,
        normalizedInput: parsed.data,
      });
      return completed;
    }
    await logConfirmedAgentWrite({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: "email" in context.user && typeof context.user.email === "string" ? context.user.email : undefined,
      toolName: tool,
      actionId,
      result,
      normalizedInput: parsed.data,
    });
    return result;
  } catch (error) {
    console.error(`Agent write '${tool}' failed`, error);
    const result = {
      success: false,
      error: "The action failed. Please try again.",
    } satisfies WriteResult;
    if (receipt?.kind === "reserved") {
      await receipt.complete(result);
    }
    await logConfirmedAgentWrite({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: "email" in context.user && typeof context.user.email === "string" ? context.user.email : undefined,
      toolName: tool,
      actionId,
      receiptId: receipt?.kind === "reserved" ? receipt.receiptId : undefined,
      result,
      normalizedInput: parsed.data,
    });
    return result;
  }
}

/** Undo a previously completed, reversible Harly write from its receipt. */
export async function undoAgentWriteAction(receiptId: string): Promise<WriteResult> {
  const context = await getWorkspaceContextOrNull();
  if (!context) return { success: false, error: "Not signed in." };

  const receipt = await getAgentActionReceipt({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    receiptId,
  });
  const undo = parseAgentActionUndo(receipt?.result?.undo);
  if (!receipt || !undo) {
    return { success: false, error: "This action cannot be undone." };
  }

  const undoActionId = `undo:${receiptId}`;
  const reservation = await reserveAgentAction({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    actionId: undoActionId,
    toolName: "undoAgentAction",
    normalizedInput: undo,
  });
  if (reservation.kind === "replay") {
    return { ...reservation.result, replayed: true, receiptId: reservation.receiptId };
  }
  if (reservation.kind === "conflict") {
    return { success: false, error: reservation.error };
  }

  try {
    const result =
      undo.kind === "moveCandidateStage"
        ? await moveApplicationStage({
            applicationId: undo.applicationId,
            fromStageId: undo.expectedCurrentStageId,
            toStageId: undo.previousStageId,
            workspaceId: context.organization.id,
          })
        : undo.kind === "deleteTask"
          ? await deleteTask(undo.taskId, undo.expectedUpdatedAt)
          : await setInterviewStatus({
              interviewId: undo.interviewId,
              candidateId: undo.candidateId,
              status: "canceled",
            });
    const normalized: WriteResult = {
      success: result.success,
      error: result.error,
      message: result.success ? "Action undone." : result.error,
    };
    await reservation.complete(normalized);
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      action: "ai.write_action.undone",
      resourceType:
        undo.kind === "moveCandidateStage"
          ? "application"
          : undo.kind === "deleteTask"
            ? "task"
            : "interview",
      resourceId:
        undo.kind === "moveCandidateStage"
          ? undo.applicationId
          : undo.kind === "deleteTask"
            ? undo.taskId
            : undo.interviewId,
      metadata: {
        source: "harly_ai",
        receiptId,
        undoReceiptId: reservation.receiptId,
        toolName: receipt.toolName,
        success: normalized.success,
      },
      severity: normalized.success ? "info" : "warning",
    });
    return { ...normalized, receiptId: reservation.receiptId };
  } catch (error) {
    console.error("Agent undo failed", error);
    const result = { success: false, error: "The undo action failed. Please try again." } satisfies WriteResult;
    await reservation.complete(result);
    return result;
  }
}
