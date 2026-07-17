import "server-only";

import { tool } from "ai";
import { z } from "zod";

/**
 * WRITE tool definitions for Harly AI.
 *
 * These intentionally have NO `execute`: the model emits the call, the panel
 * renders a confirm/cancel card, and on confirm the client routes the input
 * through `confirmAgentWriteAction` (write-actions.ts). Keep the keys in sync
 * with the HANDLERS map there.
 *
 * Every input includes a `summary` string the model must fill , a one-line,
 * human-readable description of the action for the confirmation card. This lets
 * the panel render any write tool generically without per-tool UI.
 */

const summary = z
  .string()
  .describe(
    "A short, human-readable one-line summary of this action for the confirmation card, e.g. 'Move Ana Soto to Interview'.",
  );

export function buildWriteTools() {
  return {
    moveCandidateStage: tool({
      strict: true,
      description:
        "Propose moving a candidate's application to a different pipeline stage. WRITE action , requires user confirmation; never assume success. Read the destination stage id from jobDetail first.",
      inputSchema: z.object({
        summary,
        applicationId: z.string().describe("The application to move."),
        toStageId: z
          .string()
          .describe("The destination stage id (from jobDetail)."),
        candidateName: z
          .string()
          .describe("The candidate's full name (for the confirmation card)."),
        fromStageName: z
          .string()
          .describe("The candidate's current stage name (for the card)."),
        toStageName: z
          .string()
          .describe("The destination stage name (for the card)."),
      }),
    }),

    rejectCandidate: tool({
      strict: true,
      description:
        "Propose rejecting a candidate's application. WRITE action , requires user confirmation. Only propose when the user clearly asks to reject someone. Resolve applicationId first.",
      inputSchema: z.object({
        summary,
        applicationId: z.string().describe("The application to reject."),
      }),
    }),

    createTask: tool({
      strict: true,
      description:
        "Propose creating a task/to-do. WRITE action , requires user confirmation. Defaults the owner to the current user. Optionally link it to a candidate, application, or job.",
      inputSchema: z.object({
        summary,
        title: z.string().describe("Task title."),
        description: z.string().nullable().describe("Optional detail."),
        priority: z
          .enum(["low", "medium", "high", "urgent"])
          .describe("Task priority."),
        dueDate: z
          .string()
          .nullable()
          .describe("Optional due date as an ISO date string (YYYY-MM-DD)."),
        candidateId: z
          .string()
          .nullable()
          .describe("Optional linked candidate id."),
        applicationId: z
          .string()
          .nullable()
          .describe("Optional linked application id."),
        jobId: z.string().nullable().describe("Optional linked job id."),
      }),
    }),

    updateTask: tool({
      strict: true,
      description:
        "Propose updating one existing task: change status (e.g. mark completed), title, priority, due date, or owner. WRITE action — requires user confirmation. Resolve the taskId via listTasks or listMyTasks first. For 'complete all my tasks', use completeMyOpenTasks instead; never pass a paginated list of ids here.",
      inputSchema: z.object({
        summary,
        taskId: z
          .string()
          .nullable()
          .describe("The single task id to update, or null when unavailable."),
        status: z
          .enum(["pending", "in_progress", "completed", "canceled"])
          .nullable()
          .describe("New status, or null to leave unchanged."),
        title: z
          .string()
          .nullable()
          .describe("New title, or null to leave unchanged."),
        priority: z
          .enum(["low", "medium", "high", "urgent"])
          .nullable()
          .describe("New priority, or null to leave unchanged."),
        dueDate: z
          .string()
          .nullable()
          .describe(
            "New due date as an ISO date string (YYYY-MM-DD), or null to leave unchanged.",
          ),
        clearDueDate: z
          .boolean()
          .describe("True to remove the due date; otherwise false."),
        ownerId: z
          .string()
          .nullable()
          .describe("New owner id, or null to leave unchanged."),
      }),
    }),

    completeMyOpenTasks: tool({
      strict: true,
      description:
        "Propose completing EVERY currently open task owned by the signed-in user. WRITE action — requires user confirmation. Use this, and only this, for 'complete all my tasks' or 'mark all my to-dos done'. It is server-scoped to the current user and completes the full set atomically; do not call listTasks or pass task ids first.",
      inputSchema: z.object({
        summary: summary.describe(
          "Clearly state that every currently open task assigned to the user will be completed.",
        ),
      }),
    }),

    createJob: tool({
      strict: true,
      description:
        "Propose creating a new job as a DRAFT. WRITE action , requires user confirmation. First call generateJobDraft so the copy reflects the workspace's company identity and values, then pass that structured draft here. Never publish automatically.",
      inputSchema: z.object({
        summary,
        title: z.string().describe("Job title."),
        jobSummary: z.string().describe("The generated job summary paragraph."),
        sections: z
          .array(
            z.object({
              title: z.string().describe("Section heading."),
              bullets: z
                .array(z.string())
                .describe("Concise bullets for this section."),
            }),
          )
          .describe("The sections returned by generateJobDraft."),
        department: z.string().nullable().describe("Department, or null."),
        location: z.string().nullable().describe("Location, or null."),
        employmentType: z
          .enum(["full_time", "part_time", "contract", "internship"])
          .describe("Employment type."),
        workplaceType: z
          .enum(["remote", "hybrid", "onsite"])
          .describe("Workplace type."),
        experienceLevel: z
          .string()
          .nullable()
          .describe("Experience level, or null."),
        keywords: z.array(z.string()).describe("Relevant role keywords."),
      }),
    }),

    addCandidateNote: tool({
      strict: true,
      description:
        "Propose adding a note to a candidate's profile. WRITE action , requires user confirmation. Resolve candidateId first.",
      inputSchema: z.object({
        summary,
        candidateId: z.string().describe("The candidate id."),
        body: z.string().describe("The note text."),
      }),
    }),

    addCandidateTag: tool({
      strict: true,
      description:
        "Propose adding a tag/label to a candidate. WRITE action , requires user confirmation. Resolve candidateId first.",
      inputSchema: z.object({
        summary,
        candidateId: z.string().describe("The candidate id."),
        label: z.string().describe("The tag label."),
      }),
    }),

    createOffer: tool({
      strict: true,
      description:
        "Propose drafting an offer for a candidate's application. WRITE action , requires user confirmation. Creates a DRAFT (does not send). Resolve applicationId first; read salary context from the job if helpful.",
      inputSchema: z.object({
        summary,
        applicationId: z
          .string()
          .describe("The application to make an offer on."),
        title: z.string().describe("Job title / offer title."),
        salaryAmount: z
          .number()
          .nullable()
          .describe("Base salary number, or null."),
        currency: z
          .string()
          .nullable()
          .describe("Currency code e.g. USD, or null."),
        salaryPeriod: z
          .enum(["annual", "monthly"])
          .nullable()
          .describe("Salary period, or null."),
        equity: z.string().nullable().describe("Equity description, or null."),
        startDate: z
          .string()
          .nullable()
          .describe("ISO date (YYYY-MM-DD), or null."),
        expiresAt: z
          .string()
          .nullable()
          .describe("ISO date the offer expires, or null."),
        notes: z.string().nullable().describe("Internal notes, or null."),
      }),
    }),

    sendOffer: tool({
      strict: true,
      description:
        "Propose sending a drafted offer to the candidate. WRITE action , requires user confirmation. The offer must already exist (createOffer first). Resolve offerId via listCandidateOffers.",
      inputSchema: z.object({
        summary,
        offerId: z.string().describe("The draft offer to send."),
      }),
    }),

    decideOffer: tool({
      strict: true,
      description:
        "Propose recording a candidate's decision on a sent offer (accepted or declined). WRITE action , requires user confirmation. Resolve offerId via listCandidateOffers.",
      inputSchema: z.object({
        summary,
        offerId: z.string().describe("The offer."),
        decision: z
          .enum(["accepted", "declined"])
          .describe("The candidate's decision."),
      }),
    }),

    scheduleInterview: tool({
      strict: true,
      description:
        "Propose scheduling an interview. WRITE action , requires user confirmation. Resolve candidateId + applicationId first. interviewerId is optional (null = unassigned).",
      inputSchema: z.object({
        summary,
        candidateId: z.string().describe("The candidate id."),
        applicationId: z
          .string()
          .describe("The application this interview is for."),
        type: z
          .enum(["screening", "culture_fit", "technical", "onsite", "final"])
          .describe("Interview type."),
        mode: z.enum(["video", "phone", "onsite"]).describe("Interview mode."),
        scheduledAt: z
          .string()
          .describe(
            "Local datetime string (YYYY-MM-DDTHH:mm) or ISO timestamp.",
          ),
        durationMins: z.number().describe("Duration in minutes (5–480)."),
        interviewerId: z
          .string()
          .nullable()
          .describe("Interviewer user id, or null."),
      }),
    }),

    addToTalentPool: tool({
      strict: true,
      description:
        "Propose adding a candidate to the talent pool (kept warm for future roles). WRITE action , requires user confirmation. Resolve candidateId first.",
      inputSchema: z.object({
        summary,
        candidateId: z.string().describe("The candidate id."),
        source: z
          .enum(["applied", "imported", "sourced", "referred"])
          .nullable()
          .describe("How the candidate was sourced, or null."),
        reason: z
          .string()
          .nullable()
          .describe("Why they're being pooled, or null."),
      }),
    }),

    assignFromPoolToJob: tool({
      strict: true,
      description:
        "Propose assigning a talent-pool candidate to a specific job (creates an application). WRITE action , requires user confirmation. Resolve candidateId + jobId first.",
      inputSchema: z.object({
        summary,
        candidateId: z.string().describe("The pooled candidate id."),
        jobId: z.string().describe("The job to assign them to."),
      }),
    }),

    createScorecard: tool({
      strict: true,
      description:
        "Propose adding a scorecard (team evaluation) for a candidate. WRITE action , requires user confirmation. Resolve candidateId first.",
      inputSchema: z.object({
        summary,
        candidateId: z.string().describe("The candidate id."),
        rating: z.enum(["strong", "mixed", "weak"]).describe("Overall rating."),
        comment: z.string().nullable().describe("Evaluation comment, or null."),
        stageName: z
          .string()
          .nullable()
          .describe("Stage being evaluated, or null."),
      }),
    }),

    sendCandidateEmail: tool({
      strict: true,
      description:
        "Propose sending an email to a candidate. WRITE action , requires user confirmation. Resolve candidateId + the candidate's email first (candidateProfile). Optionally base it on a template (listEmailTemplates/emailTemplate).",
      inputSchema: z.object({
        summary,
        candidateId: z.string().describe("The candidate id."),
        toEmail: z.string().describe("The recipient email."),
        subject: z.string().describe("Email subject."),
        body: z.string().describe("Email body (plain text)."),
      }),
    }),
  };
}
