import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import {
  activityEvents,
  applications,
  candidateNotes,
  candidateTags,
  candidates,
  db,
  documentAssociations,
  emailTemplates,
  interviews,
  jobs,
  jobStages,
  documentRequests,
  member as workspaceMembers,
  organization,
  offers,
  tasks,
  user as authUsers,
  workspaceSecrets,
  workflowDocumentTemplates,
  workspaceSettings,
} from "@harly/db";

import { decryptSecret } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { createNotification } from "@/server/notify/inbox";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { safeFetchWebhook } from "@/lib/ssrf";
import {
  sendWorkflowChatMessage,
  sendWorkflowDiscordMessage,
  sendWorkflowTelegramMessage,
  WorkflowChatDeliveryUncertainError,
} from "@/server/notify/dispatch";
import { enqueueEmailOutbox } from "@/lib/email/outbox-processor";
import {
  interpolateTemplate,
  findUnknownVariables,
  type TemplateValues,
} from "@/features/email-templates/interpolate";

import type { ActionType, WorkflowEvent } from "./schema";
import {
  hireApplicationForApi,
  moveApplicationStageForApi,
  rejectApplicationForApi,
  setApplicationStatusForWorkflow,
} from "@/features/applications/service";
import { evaluateApplicationForWorkflow } from "@/features/applications/auto-score";
import { assertTaskReferences } from "@/features/tasks/service";
import { isDemoMode } from "@harly/config";
import { queueCandidateErasureForWorkflow } from "@/features/candidates/deletion-jobs";
import { eraseExecutionMode } from "./erase-policy";
import { createDocumentRequestsForWorkflow } from "@/features/documents/requests-service";
import { generateDocumentForWorkflow, type WorkflowDocumentAttachment } from "@/features/documents/workflow-generation";
import { createNativeSigningLink } from "@/lib/esign/native/remote";
import {
  createInterviewForApi,
  updateInterviewForApi,
  setInterviewStatusForApi,
  INTERVIEW_MODES,
  INTERVIEW_TYPES,
} from "@/features/interviews/service";
import { createOfferForApi, sendOfferForApi } from "@/features/offers/service";
import { getWorkspaceCalStatus } from "@/lib/cal/config";
import { buildCalBookingLink } from "@/lib/cal/link";
import type { WorkflowDocumentTemplateSnapshot } from "@/features/document-templates/shared";

/**
 * The workflow action registry (§2.5). Each entry maps an ActionType to:
 *  - `schema`: the Zod schema that validates the action's `config` before run.
 *  - `run`: the executor, returning a normalized ActionResult.
 *  - `label` / `summarize`: human description for the run timeline + builder.
 *  - `requiresPermission`: the session permission the actor must hold (D1 —
 *    the workflow runs as its `createdById`, so the engine asserts this
 *    permission against that user before invoking the handler).
 *
 * Handlers receive an `ActionContext` with an explicit actor (no HTTP session):
 * the engine resolves the creator once per run and passes it down. All writes
 * use that actorId for `authorId`/`actorId`/`createdById` columns.
 *
 * Reuse rule (§10): the domain logic is NOT duplicated — handlers call into
 * the same service functions / tables the AI agent and the UI use. Where the
 * existing server action is session-coupled, the handler does the validated
 * insert directly with the explicit actor (the existing action's validation
 * schema is reused).
 */

const log = createLogger("automations");

function isRetryableWorkflowError(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "retryable" in error && (error as { retryable?: unknown }).retryable === true;
}

// ---------------------------------------------------------------------------
// Context + result
// ---------------------------------------------------------------------------

export type ActionContext = {
  workspaceId: string;
  /** Database boundary supplied by the runtime; defaults to the app client. */
  database?: typeof db;
  /** The user the workflow runs as (decision D1). */
  actorUserId: string;
  /** The trigger event that started the run, for context in messages. */
  triggerEvent: WorkflowEvent;
  /** The raw trigger payload (the `data` of emitWebhookEvent). */
  triggerPayload: Record<string, unknown>;
  /** Stable idempotency key for this effect across process retries. */
  effectKey: string;
  /** Aborted when worker loses its fenced lease during provider I/O. */
  signal?: AbortSignal;
  /** Current run id, propagated to domain events caused by this action. */
  runId: string;
  workflowId?: string;
  maxExternalActionsPerMinute?: number;
  /** Resolved once by the runtime from trigger context and declared overrides. */
  target?: AutomationTarget;
};

export type AutomationTarget = {
  applicationId: string | null;
  candidateId: string | null;
  jobId: string | null;
  interviewId: string | null;
  offerId: string | null;
};

export type ActionResult = {
  success: boolean;
  /** Control-plane quota deferral; no action effect was attempted. */
  deferUntil?: Date;
  error?: string;
  errorCode?: string;
  /** Stable provider identifier, never inferred from arbitrary result data. */
  providerRef?: string;
  /** UI/AI-safe diagnostics; never include credentials or raw provider bodies. */
  errorDetails?: {
    fieldPath?: string;
    category?: "validation" | "authorization" | "not_found" | "configuration" | "provider" | "network" | "policy" | "unknown";
    retryAdvice?: "never" | "after_backoff" | "reconcile" | "fix_configuration";
  };
  /** Whether the worker should retry this action after a backoff. */
  retryable?: boolean;
  /** The provider may have accepted the request before the response was lost. */
  uncertain?: boolean;
  /** Arbitrary data for the run-step log (ids, counts, etc.). */
  data?: Record<string, unknown>;
};

export type ActionHandler<I = unknown> = {
  schema: z.ZodType<I>;
  run: (input: I, ctx: ActionContext) => Promise<ActionResult>;
  label: string;
  summarize: (input: I) => string;
  /** Session permission the actor must hold (asserted by the engine). */
  requiresPermission?: string;
};

/**
 * Type-erased handler for the registry map. The engine validates `config`
 * against `schema` (getting a typed value) before calling `run`, and calls
 * `summarize` with the raw config object for the run timeline.
 */
export type AnyActionHandler = {
  schema: z.ZodType<unknown>;
  run: (input: unknown, ctx: ActionContext) => Promise<ActionResult>;
  label: string;
  summarize: (input: unknown) => string;
  requiresPermission?: string;
};

/**
 * The server-side contract for one immutable version of an automation tool.
 *
 * Keep executable schemas and handlers here, on the server. Consumers outside
 * this module must use `listAutomationToolManifests`, which intentionally
 * exposes only presentation and capability metadata.
 */
export type AutomationToolDescriptor = AnyActionHandler & {
  type: ActionType;
  version: number;
  category: "candidate" | "documents" | "interviews" | "offers" | "tasks" | "messaging" | "integrations";
  effect: "internal_write" | "external_write";
  simulation: "stateful" | "fixture" | "unsupported";
  /** Output contract used by the runtime and fixture-only simulator. */
  outputSchema: z.ZodType<unknown>;
  /** Whether an action can use only trigger entities or declared overrides. */
  targetPolicy: "trigger" | "trigger_or_override";
  /** Input names that may override the entity derived from the trigger. */
  targetFields: readonly ("applicationId" | "candidateId" | "jobId" | "interviewId" | "offerId")[];
  /** Safe, documented outputs that can be used by downstream bindings. */
  outputFields: readonly string[];
  integrationRequirements: readonly string[];
};

export type AutomationToolManifest = Pick<
  AutomationToolDescriptor,
  | "type"
  | "version"
  | "label"
  | "requiresPermission"
  | "category"
  | "effect"
  | "simulation"
  | "targetPolicy"
  | "targetFields"
  | "outputFields"
  | "integrationRequirements"
>;

/** Lift a typed handler into the erased shape the registry stores. */
function erase<I>(handler: ActionHandler<I>): AnyActionHandler {
  return {
    schema: handler.schema as unknown as z.ZodType<unknown>,
    run: handler.run as (input: unknown, ctx: ActionContext) => Promise<ActionResult>,
    summarize: handler.summarize as (input: unknown) => string,
    label: handler.label,
    requiresPermission: handler.requiresPermission,
  };
}

// ---------------------------------------------------------------------------
// Helper: resolve a candidate/application from the trigger payload
// ---------------------------------------------------------------------------

/**
 * Most actions target the candidate/application that triggered the workflow.
 * Pull them from the trigger payload (the shape emitWebhookEvent produces):
 *   application.created  → { application: { id }, candidateId, jobId }
 *   application.*        → { application: { id } }
 *   candidate.created    → { candidate: { id } / candidateId }
 *
 * Returns nulls when the payload doesn't carry them; the handler then fails
 * with a clear "no target" error rather than a silent no-op.
 */
function targetFromTrigger(payload: Record<string, unknown>): AutomationTarget {
  const app = payload.application as Record<string, unknown> | undefined;
  const candidate = payload.candidate as Record<string, unknown> | undefined;
  const interview = payload.interview as Record<string, unknown> | undefined;
  const job = payload.job as Record<string, unknown> | undefined;

  const applicationId =
    (typeof app?.id === "string" && app.id) ||
    (typeof interview?.applicationId === "string" && interview.applicationId) ||
    (typeof payload.applicationId === "string" && payload.applicationId) ||
    null;
  const candidateId =
    (typeof candidate?.id === "string" && candidate.id) ||
    (typeof app?.candidateId === "string" && app.candidateId) ||
    (typeof interview?.candidateId === "string" && interview.candidateId) ||
    (typeof payload.candidateId === "string" && payload.candidateId) ||
    null;
  const jobId =
    (typeof payload.jobId === "string" && payload.jobId) ||
    (typeof app?.jobId === "string" && app.jobId) ||
    (typeof interview?.jobId === "string" && interview.jobId) ||
    (typeof job?.id === "string" && job.id) ||
    null;
  const interviewId =
    (typeof interview?.id === "string" && interview.id) ||
    (typeof payload.interviewId === "string" && payload.interviewId) ||
    null;
  const offerId =
    (typeof (payload.offer as Record<string, unknown> | undefined)?.id === "string" && (payload.offer as Record<string, unknown>).id as string) ||
    (typeof payload.offerId === "string" && payload.offerId) ||
    null;
  return { applicationId, candidateId, jobId, interviewId, offerId };
}

/**
 * A handler never independently interprets target overrides. The adapter
 * resolves only fields declared by the selected tool, then handlers and
 * template interpolation consume this immutable target.
 */
function resolveAutomationTargetFromInput(
  payload: Record<string, unknown>,
  input: Record<string, unknown>,
  targetFields: readonly (keyof AutomationTarget)[],
): { target: AutomationTarget; explicit: Set<keyof AutomationTarget> } {
  const triggerTarget = targetFromTrigger(payload);
  const target: AutomationTarget = { ...triggerTarget };
  const explicit = new Set<keyof AutomationTarget>();
  for (const field of targetFields) {
    const value = input[field];
    if (typeof value === "string" && value.trim()) {
      target[field] = value;
      explicit.add(field);
    }
  }
  return { target, explicit };
}

/**
 * Resolve and validate the effective entity identity once at the runtime
 * boundary. An override must belong to this workspace, and a candidate cannot
 * silently inherit a different application's template context.
 */
export async function resolveAutomationTarget(input: {
  workspaceId: string;
  database?: typeof db;
  payload: Record<string, unknown>;
  actionInput: Record<string, unknown>;
  targetFields: readonly (keyof AutomationTarget)[];
}): Promise<
  | { ok: true; target: AutomationTarget }
  | { ok: false; fieldPath: string; message: string }
> {
  const { target, explicit } = resolveAutomationTargetFromInput(
    input.payload,
    input.actionInput,
    input.targetFields,
  );
  const database = input.database ?? db;

  if (explicit.has("candidateId") && !explicit.has("applicationId")) {
    // A candidate override changes the template identity. Never keep stale
    // application/job/interview metadata from the triggering candidate.
    target.applicationId = null;
    target.jobId = null;
    target.interviewId = null;
    target.offerId = null;
  }

  if (
    (explicit.has("interviewId") || explicit.has("offerId")) &&
    !explicit.has("applicationId") &&
    !explicit.has("candidateId") &&
    !explicit.has("jobId")
  ) {
    // A produced interview/offer is a new target, not an annotation on the
    // triggering application. Clear trigger identity before deriving the
    // resource's real application/candidate/job below.
    target.applicationId = null;
    target.candidateId = null;
    target.jobId = null;
  }

  if (target.interviewId) {
    const [interview] = await database
      .select({
        applicationId: interviews.applicationId,
        candidateId: interviews.candidateId,
        jobId: interviews.jobId,
      })
      .from(interviews)
      .where(and(
        eq(interviews.workspaceId, input.workspaceId),
        eq(interviews.id, target.interviewId),
      ))
      .limit(1);
    if (!interview) {
      return {
        ok: false,
        fieldPath: "interviewId",
        message: "The selected interview is not available in this workspace.",
      };
    }
    if (
      (target.applicationId && target.applicationId !== interview.applicationId) ||
      (target.candidateId && target.candidateId !== interview.candidateId) ||
      (target.jobId && target.jobId !== interview.jobId)
    ) {
      return {
        ok: false,
        fieldPath: "interviewId",
        message: "The selected interview does not match the effective application target.",
      };
    }
    target.applicationId = interview.applicationId;
    target.candidateId = interview.candidateId;
    target.jobId = interview.jobId;
  }

  if (target.offerId) {
    const [offer] = await database
      .select({
        applicationId: offers.applicationId,
        candidateId: offers.candidateId,
        jobId: offers.jobId,
      })
      .from(offers)
      .where(and(
        eq(offers.workspaceId, input.workspaceId),
        eq(offers.id, target.offerId),
      ))
      .limit(1);
    if (!offer) {
      return {
        ok: false,
        fieldPath: "offerId",
        message: "The selected offer is not available in this workspace.",
      };
    }
    if (
      (target.applicationId && target.applicationId !== offer.applicationId) ||
      (target.candidateId && target.candidateId !== offer.candidateId) ||
      (target.jobId && target.jobId !== offer.jobId)
    ) {
      return {
        ok: false,
        fieldPath: "offerId",
        message: "The selected offer does not match the effective application target.",
      };
    }
    target.applicationId = offer.applicationId;
    target.candidateId = offer.candidateId;
    target.jobId = offer.jobId;
  }

  if (target.applicationId) {
    const [application] = await database
      .select({
        candidateId: applications.candidateId,
        jobId: applications.jobId,
      })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, input.workspaceId),
          eq(applications.id, target.applicationId),
        ),
      )
      .limit(1);
    if (!application) {
      return {
        ok: false,
        fieldPath: "applicationId",
        message: "The selected application is not available in this workspace.",
      };
    }
    if (target.candidateId && target.candidateId !== application.candidateId) {
      return {
        ok: false,
        fieldPath: "candidateId",
        message: "The selected candidate does not belong to the selected application.",
      };
    }
    if (target.jobId && target.jobId !== application.jobId) {
      return {
        ok: false,
        fieldPath: "jobId",
        message: "The selected job does not match the selected application.",
      };
    }
    target.candidateId = application.candidateId;
    target.jobId = application.jobId;
  } else if (target.candidateId) {
    const [candidate] = await database
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.workspaceId, input.workspaceId),
          eq(candidates.id, target.candidateId),
          isNull(candidates.deletedAt),
        ),
      )
      .limit(1);
    if (!candidate) {
      return {
        ok: false,
        fieldPath: "candidateId",
        message: "The selected candidate is not available in this workspace.",
      };
    }
  }
  return { ok: true, target };
}

function effectiveTarget(ctx: ActionContext): AutomationTarget {
  return ctx.target ?? targetFromTrigger(ctx.triggerPayload);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function emptyToUndef(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

async function loadTemplateValues(
  ctx: ActionContext,
  target: {
    applicationId: string | null;
    candidateId: string | null;
    jobId: string | null;
    interviewId?: string | null;
    offerId?: string | null;
  },
): Promise<{
  values: TemplateValues;
  candidate: { firstName: string; lastName: string; email: string } | null;
  companyName: string;
}> {
  const database = ctx.database ?? db;
  let candidate: { firstName: string; lastName: string; email: string } | null = null;
  let companyName = "Harly";
  let jobTitle = "";
  let stageName = "";
  let senderName = "";
  let interviewDate = "";
  let interviewTime = "";
  let interviewLocation = "";
  let interviewDuration = "";
  let interviewerName = "";
  let offerSalary = "";
  let offerExpiry = "";
  let offerStartDate = "";
  let offerUrl = "";

  if (target.candidateId) {
    const [cand] = await database
      .select({
        email: candidates.email,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
      })
      .from(candidates)
      .where(
        and(
          eq(candidates.workspaceId, ctx.workspaceId),
          eq(candidates.id, target.candidateId),
          isNull(candidates.deletedAt),
        ),
      )
      .limit(1);
    if (cand) candidate = cand;
  }

  const [ws] = await database
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, ctx.workspaceId))
    .limit(1);
  if (ws?.name) companyName = ws.name;

  if (target.jobId) {
    const [j] = await database
      .select({ title: jobs.title })
      .from(jobs)
      .where(and(eq(jobs.workspaceId, ctx.workspaceId), eq(jobs.id, target.jobId)))
      .limit(1);
    if (j) jobTitle = j.title;
  }

  const payload = ctx.triggerPayload;
  const namedStage =
    (typeof payload.toStageName === "string" && payload.toStageName) ||
    (typeof payload.stageName === "string" && payload.stageName) ||
    "";
  if (namedStage) stageName = namedStage;
  else if (target.applicationId) {
    const [stage] = await database
      .select({ name: jobStages.name })
      .from(jobStages)
      .innerJoin(
        applications,
        and(
          eq(applications.workspaceId, ctx.workspaceId),
          eq(applications.id, target.applicationId),
          eq(applications.currentStageId, jobStages.id),
        ),
      )
      .limit(1);
    if (stage) stageName = stage.name;
  }

  if (ctx.actorUserId) {
    const [actor] = await database
      .select({ name: authUsers.name })
      .from(authUsers)
      .where(eq(authUsers.id, ctx.actorUserId))
      .limit(1);
    if (actor?.name) senderName = actor.name;
  }

  const interviewId = typeof target.interviewId === "string" ? target.interviewId : null;
  if (interviewId) {
    const [interview] = await database
      .select({
        scheduledAt: interviews.scheduledAt,
        durationMins: interviews.durationMins,
        location: interviews.location,
        meetLink: interviews.meetLink,
        interviewerId: interviews.interviewerId,
      })
      .from(interviews)
      .where(and(eq(interviews.workspaceId, ctx.workspaceId), eq(interviews.id, interviewId)))
      .limit(1);
    if (interview) {
      const scheduledAt = interview.scheduledAt;
      interviewDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(scheduledAt);
      interviewTime = new Intl.DateTimeFormat("en-US", { timeStyle: "short" }).format(scheduledAt);
      interviewLocation = interview.location ?? interview.meetLink ?? "";
      interviewDuration = `${interview.durationMins} min`;
      if (interview.interviewerId) {
        const [interviewer] = await database
          .select({ name: authUsers.name })
          .from(authUsers)
          .where(eq(authUsers.id, interview.interviewerId))
          .limit(1);
        interviewerName = interviewer?.name ?? "";
      }
    }
  }

  const offerId = typeof target.offerId === "string" ? target.offerId : null;
  if (offerId) {
    const [offer] = await database
      .select({ salaryAmount: offers.salaryAmount, currency: offers.currency, salaryPeriod: offers.salaryPeriod, expiresAt: offers.expiresAt, startDate: offers.startDate, applicationId: offers.applicationId })
      .from(offers)
      .where(and(eq(offers.workspaceId, ctx.workspaceId), eq(offers.id, offerId)))
      .limit(1);
    if (offer) {
      offerSalary = offer.salaryAmount === null || offer.salaryAmount === undefined
        ? ""
        : `${offer.currency ?? ""} ${offer.salaryAmount}${offer.salaryPeriod ? ` / ${offer.salaryPeriod}` : ""}`.trim();
      offerExpiry = offer.expiresAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(offer.expiresAt) : "";
      offerStartDate = offer.startDate ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(offer.startDate) : "";
      offerUrl = `${getHarlyPublicOrigin()}/portal/applications/${offer.applicationId}`;
    }
  }

  const values: TemplateValues = {
    candidate_first_name: candidate?.firstName ?? "",
    candidate_last_name: candidate?.lastName ?? "",
    candidate_full_name: candidate
      ? `${candidate.firstName} ${candidate.lastName}`.trim()
      : "",
    job_title: jobTitle,
    stage_name: stageName,
    company_name: companyName,
    sender_name: senderName,
    portal_link: target.applicationId
      ? `${getHarlyPublicOrigin()}/portal/applications/${target.applicationId}`
      : "",
    interview_date: interviewDate,
    interview_time: interviewTime,
    interview_location: interviewLocation,
    interview_duration: interviewDuration,
    interviewer_name: interviewerName,
    offer_salary: offerSalary,
    offer_expiry: offerExpiry,
    offer_start_date: offerStartDate,
    offer_url: offerUrl,
  };

  return { values, candidate, companyName };
}

// ---------------------------------------------------------------------------
// move_stage — move the triggering application to a stage
// ---------------------------------------------------------------------------

const moveStageSchema = z
  .object({
    /** Explicit target; otherwise the application from the trigger is used. */
    applicationId: z.string().min(1).optional(),
    toStageId: z.string().min(1).optional(),
    /** Optional: target by stage name instead of id (resolved per job). */
    toStageName: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.toStageId || data.toStageName), {
    message: "Either toStageId or toStageName must be provided.",
  });

async function resolveStageId(
  workspaceId: string,
  applicationId: string,
  config: z.infer<typeof moveStageSchema>,
  database: typeof db = db,
): Promise<string | null> {
  if (config.toStageId) {
    const [stage] = await database
      .select({ id: jobStages.id })
      .from(jobStages)
      .innerJoin(
        applications,
        and(
          eq(applications.workspaceId, workspaceId),
          eq(applications.id, applicationId),
          eq(applications.jobId, jobStages.jobId),
        ),
      )
      .where(and(eq(jobStages.workspaceId, workspaceId), eq(jobStages.id, config.toStageId)))
      .limit(1);
    if (stage?.id) return stage.id;
  }
  if (config.toStageName) {
    const [stage] = await database
      .select({ id: jobStages.id })
      .from(jobStages)
      .innerJoin(
        applications,
        and(
          eq(applications.workspaceId, workspaceId),
          eq(applications.id, applicationId),
          eq(applications.jobId, jobStages.jobId),
        ),
      )
      .where(
        and(
          eq(jobStages.workspaceId, workspaceId),
          sql`lower(trim(${jobStages.name})) = lower(trim(${config.toStageName}))`,
        ),
      )
      .limit(1);
    return stage?.id ?? null;
  }
  return null;
}

const moveStageHandler: ActionHandler<z.infer<typeof moveStageSchema>> = {
  schema: moveStageSchema,
  requiresPermission: "candidates:move",
  label: "Move to stage",
  summarize: (input) =>
    `Move to ${input.toStageName ?? input.toStageId}`,
  async run(input, ctx) {
    const { applicationId } = effectiveTarget(ctx);
    if (!applicationId) return { success: false, error: "No application in trigger payload." };

    const stageId = await resolveStageId(ctx.workspaceId, applicationId, input, ctx.database);
    if (!stageId) return { success: false, error: "Target stage not found for this job." };

    const updated = await moveApplicationStageForApi({
      workspaceId: ctx.workspaceId,
      applicationId,
      toStageId: stageId,
      actorId: ctx.actorUserId,
      retryOnConflict: true,
      automationRunId: ctx.runId,
      database: ctx.database,
    });

    return {
      success: true,
      data: { applicationId: updated.id, toStageId: updated.currentStageId },
    };
  },
};

// ---------------------------------------------------------------------------
// set_status — active / hired / rejected / withdrawn
// ---------------------------------------------------------------------------

const setStatusSchema = z.object({
  /** Explicit target; otherwise the application from the trigger is used. */
  applicationId: z.string().min(1).optional(),
  status: z.enum(["active", "hired", "rejected", "withdrawn"]),
});

const setStatusHandler: ActionHandler<z.infer<typeof setStatusSchema>> = {
  schema: setStatusSchema,
  requiresPermission: "candidates:edit",
  label: "Set status",
  summarize: (input) => `Set status: ${input.status}`,
  async run(input, ctx) {
    const database = ctx.database ?? db;
    const { applicationId } = effectiveTarget(ctx);
    if (!applicationId) return { success: false, error: "No application in trigger payload." };

    if (input.status === "hired" || input.status === "rejected") {
      const updated = await (input.status === "hired"
        ? hireApplicationForApi
        : rejectApplicationForApi)({
        workspaceId: ctx.workspaceId,
        applicationId,
        actorId: ctx.actorUserId,
        automationRunId: ctx.runId,
        database: ctx.database,
      });
      return {
        success: true,
        data: { applicationId: updated.id, status: updated.status },
      };
    }

    const updated = await setApplicationStatusForWorkflow({
      workspaceId: ctx.workspaceId,
      applicationId,
      status: input.status,
      actorId: ctx.actorUserId,
      automationRunId: ctx.runId,
      retryOnConflict: true,
      database,
    });

    return { success: true, data: { applicationId: updated.id, status: updated.status } };
  },
};

// ---------------------------------------------------------------------------
// ai_score — evaluate candidate match against job requirements with AI
// ---------------------------------------------------------------------------

const aiScoreSchema = z.object({
  /** Explicit application target; otherwise inferred from trigger. */
  applicationId: z.string().uuid().optional(),
}).passthrough();

const aiScoreWorkflowHandler: ActionHandler<z.infer<typeof aiScoreSchema>> = {
  schema: aiScoreSchema,
  requiresPermission: "candidates:edit",
  label: "Score candidate with AI",
  summarize: () => "Score candidate with AI",
  async run(input, ctx) {
    const target = effectiveTarget(ctx);
    const applicationId = input.applicationId ?? target.applicationId;
    if (!applicationId) {
      return { success: false, error: "No application in trigger payload or target." };
    }

    const evaluation = await evaluateApplicationForWorkflow({
      workspaceId: ctx.workspaceId,
      applicationId,
      actorUserId: ctx.actorUserId,
      database: ctx.database,
      runId: ctx.runId,
    });

    if (!evaluation.success) {
      return {
        success: false,
        error: evaluation.error ?? "Failed to score candidate with AI.",
      };
    }

    return {
      success: true,
      data: {
        applicationId,
        score: evaluation.score ?? 0,
        recommendation: evaluation.recommendation ?? "neutral",
        evaluationId: evaluation.evaluationId,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// erase_candidate_data — durable, workspace-scoped candidate erasure
// ---------------------------------------------------------------------------

const eraseCandidateDataSchema = z.object({
  /** Explicit candidate target; otherwise inferred from the trigger. */
  candidateId: z.string().uuid().optional(),
  /**
   * require_approval (default): every path to this action must include an
   * approval node. automatic: allowed only when workspace data retention is
   * enabled (settings) — retention would purge the data eventually anyway.
   */
  executionMode: z.enum(["require_approval", "automatic"]).optional(),
}).passthrough();

const eraseCandidateDataWorkflowHandler: ActionHandler<z.infer<typeof eraseCandidateDataSchema>> = {
  schema: eraseCandidateDataSchema,
  requiresPermission: "candidates:delete",
  label: "Queue candidate data erasure",
  summarize: () => "Queue complete candidate data erasure",
  async run(input, ctx) {
    const target = effectiveTarget(ctx);
    const candidateId = input.candidateId ?? target.candidateId;
    if (!candidateId) {
      return {
        success: false,
        error: "No candidate in trigger payload or target.",
        errorCode: "CANDIDATE_REQUIRED",
      };
    }

    const mode = eraseExecutionMode({
      executionMode:
        input.executionMode === undefined
          ? { kind: "literal", value: "require_approval" }
          : { kind: "literal", value: input.executionMode },
    });
    if (mode === "automatic") {
      const database = ctx.database ?? db;
      const [settings] = await database
        .select({
          dataRetentionEnabled: workspaceSettings.dataRetentionEnabled,
        })
        .from(workspaceSettings)
        .where(eq(workspaceSettings.organizationId, ctx.workspaceId))
        .limit(1);
      if (!settings?.dataRetentionEnabled) {
        return {
          success: false,
          error:
            "Automatic candidate erasure requires workspace data retention to be enabled in settings.",
          errorCode: "RETENTION_REQUIRED_FOR_AUTOMATIC_ERASE",
          errorDetails: {
            category: "policy",
            retryAdvice: "never",
          },
        };
      }
    }

    const job = await queueCandidateErasureForWorkflow({
      workspaceId: ctx.workspaceId,
      candidateId,
      requestedBy: ctx.actorUserId,
      database: ctx.database,
    });
    if (!job) {
      return {
        success: false,
        error: "Candidate not found in this workspace.",
        errorCode: "CANDIDATE_NOT_FOUND",
        errorDetails: { category: "not_found", retryAdvice: "never" },
      };
    }

    return {
      success: true,
      data: {
        candidateId,
        deletionJobId: job.id,
        queued: job.status !== "completed",
        status: job.status,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// add_note — add a candidate note authored by the workflow actor
// ---------------------------------------------------------------------------

const addNoteSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  /** Override which candidate the note targets; defaults to the trigger's. */
  candidateId: z.string().min(1).optional(),
});

const addNoteHandler: ActionHandler<z.infer<typeof addNoteSchema>> = {
  schema: addNoteSchema,
  requiresPermission: "collab:write",
  label: "Add candidate note",
  summarize: (input) => `Add note: ${input.body.slice(0, 80)}`,
  async run(input, ctx) {
    const database = ctx.database ?? db;
    const target = effectiveTarget(ctx);
    const candidateId = target.candidateId;
    if (!candidateId) return { success: false, error: "No candidate in trigger payload." };
    const { values } = await loadTemplateValues(ctx, target);
    const body = interpolateTemplate(input.body, values);

    const [candidate] = await database
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.workspaceId, ctx.workspaceId),
          eq(candidates.id, candidateId),
          isNull(candidates.deletedAt),
        ),
      )
      .limit(1);
    if (!candidate) return { success: false, error: "Candidate not found." };

    const [existingNote] = await database
      .select({ id: candidateNotes.id })
      .from(candidateNotes)
      .where(
        and(
          eq(candidateNotes.workspaceId, ctx.workspaceId),
          eq(candidateNotes.workflowEffectId, ctx.effectKey),
        ),
      )
      .limit(1);
    if (existingNote) return { success: true, data: { noteId: existingNote.id, candidateId } };

    const [note] = await database
      .insert(candidateNotes)
      .values({
        workspaceId: ctx.workspaceId,
        candidateId,
        authorId: ctx.actorUserId,
        body,
        workflowEffectId: ctx.effectKey,
      })
      .returning({ id: candidateNotes.id });

    await database.insert(activityEvents).values({
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorUserId,
      entityType: "candidate",
      entityId: candidateId,
      type: "note.added",
      metadata: { preview: body.slice(0, 100), source: "workflow" },
    });

    return { success: true, data: { noteId: note?.id, candidateId } };
  },
};

// ---------------------------------------------------------------------------
// add_tag / remove_tag
// ---------------------------------------------------------------------------

const addTagSchema = z.object({
  label: z.string().trim().min(1).max(50),
  candidateId: z.string().min(1).optional(),
});

const addTagHandler: ActionHandler<z.infer<typeof addTagSchema>> = {
  schema: addTagSchema,
  requiresPermission: "candidates:edit",
  label: "Add candidate tag",
  summarize: (input) => `Add tag: ${input.label}`,
  async run(input, ctx) {
    const database = ctx.database ?? db;
    const candidateId = effectiveTarget(ctx).candidateId;
    if (!candidateId) return { success: false, error: "No candidate in trigger payload." };

    const [candidate] = await database
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.workspaceId, ctx.workspaceId),
          eq(candidates.id, candidateId),
          isNull(candidates.deletedAt),
        ),
      )
      .limit(1);
    if (!candidate) return { success: false, error: "Candidate not found." };

    await database
      .insert(candidateTags)
      .values({
        workspaceId: ctx.workspaceId,
        candidateId,
        label: input.label,
        createdById: ctx.actorUserId,
        workflowEffectId: ctx.effectKey,
      })
      .onConflictDoNothing();

    return { success: true, data: { candidateId, label: input.label } };
  },
};

const removeTagSchema = addTagSchema;

const removeTagHandler: ActionHandler<z.infer<typeof removeTagSchema>> = {
  schema: removeTagSchema,
  requiresPermission: "candidates:edit",
  label: "Remove candidate tag",
  summarize: (input) => `Remove tag: ${input.label}`,
  async run(input, ctx) {
    const database = ctx.database ?? db;
    const candidateId = effectiveTarget(ctx).candidateId;
    if (!candidateId) return { success: false, error: "No candidate in trigger payload." };

    const [candidate] = await database
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.workspaceId, ctx.workspaceId),
          eq(candidates.id, candidateId),
          isNull(candidates.deletedAt),
        ),
      )
      .limit(1);
    if (!candidate) return { success: false, error: "Candidate not found." };

    await database
      .delete(candidateTags)
      .where(
        and(
          eq(candidateTags.workspaceId, ctx.workspaceId),
          eq(candidateTags.candidateId, candidateId),
          eq(candidateTags.label, input.label),
        ),
      );

    return { success: true, data: { candidateId, label: input.label } };
  },
};

// ---------------------------------------------------------------------------
// create_task — assign a task to a workspace member
// ---------------------------------------------------------------------------

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  dueDate: z.string().optional(),
  dueOffsetDays: z.coerce.number().int().min(0).max(365).optional(),
  ownerId: z.string().min(1).optional(),
  candidateId: z.string().min(1).optional(),
  applicationId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
});

const createTaskHandler: ActionHandler<z.infer<typeof createTaskSchema>> = {
  schema: createTaskSchema,
  requiresPermission: "collab:write",
  label: "Create task",
  summarize: (input) => `Create task: ${input.title}`,
  async run(input, ctx) {
    const database = ctx.database ?? db;
    const target = effectiveTarget(ctx);
    const candidateId = target.candidateId;
    const applicationId = target.applicationId;
    const jobId = target.jobId;
    const { values } = await loadTemplateValues(ctx, target);
    const title = interpolateTemplate(input.title, values);
    const description = input.description === undefined ? undefined : interpolateTemplate(input.description, values);
    try {
      await assertTaskReferences({
        workspaceId: ctx.workspaceId,
        ownerId: input.ownerId ?? ctx.actorUserId,
        links: { candidateId, applicationId, jobId, interviewId: null },
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Invalid task references.",
      };
    }
    const [existingTask] = await database
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, ctx.workspaceId),
          eq(tasks.workflowEffectId, ctx.effectKey),
        ),
      )
      .limit(1);
    if (existingTask) return { success: true, data: { taskId: existingTask.id } };

    let calculatedDueDate: Date | null = null;
    if (typeof input.dueOffsetDays === "number" && input.dueOffsetDays >= 0) {
      calculatedDueDate = new Date(Date.now() + input.dueOffsetDays * 24 * 60 * 60 * 1000);
    } else if (input.dueDate) {
      calculatedDueDate = new Date(input.dueDate);
    }

    const [created] = await database
      .insert(tasks)
      .values({
        workspaceId: ctx.workspaceId,
        title,
        description: description ?? null,
        priority: input.priority,
        status: "pending",
        dueDate: calculatedDueDate,
        ownerId: input.ownerId ?? ctx.actorUserId,
        candidateId,
        applicationId,
        jobId,
        createdById: ctx.actorUserId,
        workflowEffectId: ctx.effectKey,
      })
      .returning({ id: tasks.id });

    if (!created) return { success: false, error: "Task could not be created." };

    await database.insert(activityEvents).values({
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorUserId,
      entityType: "task",
      entityId: created.id,
      type: "task.created",
      metadata: { source: "workflow" },
    });

    return { success: true, data: { taskId: created.id } };
  },
};

// ---------------------------------------------------------------------------
// request_documents — ask the candidate for a portal document package
// ---------------------------------------------------------------------------

const requestDocumentsWorkflowSchema = z.object({
  applicationId: z.string().min(1).optional(),
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        instructions: z.string().trim().max(2000).optional(),
      }),
    )
    .min(1)
    .max(20),
  dueAt: z.iso.datetime().nullable().optional(),
});

const requestDocumentsWorkflowHandler: ActionHandler<z.infer<typeof requestDocumentsWorkflowSchema>> = {
  schema: requestDocumentsWorkflowSchema,
  requiresPermission: "documents:manage",
  label: "Request documents",
  summarize: (input) => `Request ${input.items.length} document${input.items.length === 1 ? "" : "s"}`,
  async run(input, ctx) {
    const target = effectiveTarget(ctx);
    const applicationId = target.applicationId;
    if (!applicationId) return { success: false, error: "No application in trigger payload." };
    const { values } = await loadTemplateValues(ctx, target);
    const items = input.items.map((item) => ({
      ...item,
      title: interpolateTemplate(item.title, values),
      instructions: item.instructions === undefined ? undefined : interpolateTemplate(item.instructions, values),
    }));

    const result = await createDocumentRequestsForWorkflow({
      database: ctx.database,
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.actorUserId,
      applicationId,
      items,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      effectKey: ctx.effectKey,
    });
    if (!result.ok) return { success: false, error: result.error, errorCode: "DOCUMENT_REQUEST_FAILED" };
    return {
      success: true,
      data: {
        applicationId: result.applicationId,
        candidateId: result.candidateId,
        packageId: result.packageId,
        primaryRequestId: result.requestIds[0] ?? null,
        requestIds: result.requestIds,
        reused: result.reused,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// generate_document — render a deterministic, variable-filled PDF
// ---------------------------------------------------------------------------

const generateDocumentWorkflowSchema = z.object({
  applicationId: z.string().min(1).optional(),
  templateId: z.string().min(1).optional(),
  templateSnapshot: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    title: z.string().trim().min(1).max(255),
    body: z.string().trim().min(1).max(50_000),
    format: z.enum(["plain_text", "rich_text"]),
  }).optional(),
  title: z.string().trim().min(1).max(255).optional(),
  body: z.string().trim().min(1).max(50_000).optional(),
  attachments: z.array(z.object({
    documentId: z.string().min(1),
    name: z.string().trim().min(1).max(255),
    checksum: z.string().regex(/^[a-f0-9]{64}$/i),
  })).max(10).optional(),
}).refine(
  (input) => Boolean(input.templateId || input.templateSnapshot || (input.title && input.body)),
  "Choose a reusable document template or provide a title and content.",
).refine(
  (input) => !input.templateId || !input.templateSnapshot || input.templateId === input.templateSnapshot.id,
  "The document template snapshot does not match its template id.",
);

const generateDocumentWorkflowHandler: ActionHandler<z.infer<typeof generateDocumentWorkflowSchema>> = {
  schema: generateDocumentWorkflowSchema,
  requiresPermission: "documents:manage",
  label: "Generate document",
  summarize: (input) => `Generate document: ${input.templateSnapshot?.name ?? input.title ?? "document"}`,
  async run(input, ctx) {
    const database = ctx.database ?? db;
    const target = effectiveTarget(ctx);
    const applicationId = target.applicationId;
    if (!applicationId) return { success: false, error: "No application in trigger payload.", errorCode: "APPLICATION_REQUIRED" };

    const { values } = await loadTemplateValues(ctx, target);
    let source: Pick<WorkflowDocumentTemplateSnapshot, "title" | "body"> | null = input.templateSnapshot ?? null;
    if (!source && input.templateId) {
      const [template] = await database
        .select({ title: workflowDocumentTemplates.title, body: workflowDocumentTemplates.body })
        .from(workflowDocumentTemplates)
        .where(and(
          eq(workflowDocumentTemplates.workspaceId, ctx.workspaceId),
          eq(workflowDocumentTemplates.id, input.templateId),
        ))
        .limit(1);
      if (!template) return { success: false, error: "Document template not found.", errorCode: "DOCUMENT_TEMPLATE_NOT_FOUND" };
      source = template;
    }
    const title = source?.title ?? input.title;
    const body = source?.body ?? input.body;
    if (!title || !body) return { success: false, error: "A document template or title and content are required.", errorCode: "DOCUMENT_CONTENT_REQUIRED" };
    const unknown = findUnknownVariables(`${title}\n${body}`);
    if (unknown.length > 0) {
      return {
        success: false,
        error: `Unknown document variable${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`,
        errorCode: "UNKNOWN_DOCUMENT_VARIABLE",
      };
    }

    const result = await generateDocumentForWorkflow({
      database,
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.actorUserId,
      applicationId,
      title: interpolateTemplate(title, values),
      body: interpolateTemplate(body, values),
      attachments: input.attachments as WorkflowDocumentAttachment[] | undefined,
      effectKey: ctx.effectKey,
    });
    if (!result.ok) return { success: false, error: result.error, errorCode: "DOCUMENT_GENERATION_FAILED" };
    return {
      success: true,
      data: {
        documentId: result.documentId,
        documentVersionId: result.documentVersionId,
        applicationId: result.applicationId,
        candidateId: result.candidateId,
        reused: result.reused,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// send_document_for_signature — create a portal signing invitation
// ---------------------------------------------------------------------------

const sendDocumentForSignatureSchema = z.object({
  documentId: z.preprocess(emptyToUndef, z.string().min(1).optional()),
  /** Bind to the uploaded document produced by a prior request_documents step. */
  documentRequestId: z.preprocess(emptyToUndef, z.string().min(1).optional()),
  recipientEmail: z.email().optional(),
  recipientName: z.string().trim().min(1).max(200).optional(),
  /** Ordered signers. When omitted, the candidate is the sole signer. */
  recipients: z.array(z.object({ email: z.email(), name: z.string().trim().min(1).max(200) })).min(1).max(10).optional(),
  subject: z.string().trim().max(255).optional(),
  message: z.string().trim().max(4000).optional(),
}).refine(
  (input) => Boolean(input.documentId) !== Boolean(input.documentRequestId),
  "Choose a document or bind an uploaded document request, but not both.",
);

const sendDocumentForSignatureHandler: ActionHandler<z.infer<typeof sendDocumentForSignatureSchema>> = {
  schema: sendDocumentForSignatureSchema,
  requiresPermission: "documents:manage",
  label: "Send document for signature",
  summarize: () => "Send a document for portal signature",
  async run(input, ctx) {
    const target = effectiveTarget(ctx);
    const { values, candidate } = await loadTemplateValues(ctx, target);
    const recipientEmail = input.recipientEmail ?? candidate?.email;
    const recipientName = input.recipientName ?? ([candidate?.firstName, candidate?.lastName].filter(Boolean).join(" ") || undefined);
    const recipients = input.recipients ?? (recipientEmail && recipientName ? [{ email: recipientEmail, name: recipientName }] : undefined);
    if (!recipients?.length) {
      return { success: false, error: "No candidate recipient found for signature." };
    }

    const database = ctx.database ?? db;
    const applicationId = target.applicationId;
    const candidateId = target.candidateId;
    if (!applicationId || !candidateId) {
      return { success: false, error: "Signature documents must target an application and candidate.", errorCode: "SIGNATURE_TARGET_REQUIRED" };
    }

    const [application] = await database
      .select({ candidateId: applications.candidateId })
      .from(applications)
      .where(and(
        eq(applications.workspaceId, ctx.workspaceId),
        eq(applications.id, applicationId),
      ))
      .limit(1);
    if (!application || application.candidateId !== candidateId) {
      return { success: false, error: "The workflow target application does not belong to its candidate.", errorCode: "SIGNATURE_TARGET_MISMATCH" };
    }

    let documentId = input.documentId;
    if (!documentId && input.documentRequestId) {
      const [request] = await database
        .select({
          documentId: documentRequests.documentId,
          status: documentRequests.status,
          applicationId: documentRequests.applicationId,
          candidateId: documentRequests.candidateId,
        })
        .from(documentRequests)
        .where(and(
          eq(documentRequests.workspaceId, ctx.workspaceId),
          eq(documentRequests.id, input.documentRequestId),
        ))
        .limit(1);
      if (!request) return { success: false, error: "Document request not found.", errorCode: "DOCUMENT_REQUEST_NOT_FOUND" };
      if (request.applicationId !== applicationId || request.candidateId !== candidateId) {
        return { success: false, error: "The document request belongs to a different workflow target.", errorCode: "DOCUMENT_TARGET_MISMATCH" };
      }
      if (!request.documentId || !["submitted", "accepted"].includes(request.status)) {
        return { success: false, error: "The requested document has not been uploaded yet or was declined.", errorCode: "DOCUMENT_NOT_READY_FOR_SIGNATURE" };
      }
      documentId = request.documentId;
    }
    if (!documentId) return { success: false, error: "A document is required for signature." };

    // A raw UUID is not enough authorization for a workflow effect. Require
    // the document to be explicitly associated with this application; this
    // covers generated documents and portal uploads without adding a second
    // denormalized ownership relationship to the documents table.
    const [association] = await database
      .select({ id: documentAssociations.id })
      .from(documentAssociations)
      .where(and(
        eq(documentAssociations.workspaceId, ctx.workspaceId),
        eq(documentAssociations.documentId, documentId),
        eq(documentAssociations.targetType, "application"),
        eq(documentAssociations.targetId, applicationId),
      ))
      .limit(1);
    if (!association) {
      return { success: false, error: "The document is not associated with the workflow application.", errorCode: "DOCUMENT_TARGET_MISMATCH" };
    }

    const subject = input.subject === undefined ? undefined : interpolateTemplate(input.subject, values);
    const message = input.message === undefined ? undefined : interpolateTemplate(input.message, values);

    try {
      const result = await createNativeSigningLink({
        database,
        workspaceId: ctx.workspaceId,
        documentId,
        actorId: ctx.actorUserId,
        recipients,
        subject,
        message,
        effectKey: ctx.effectKey,
        automationParentRunId: ctx.runId,
      });
      if (!result.ok) return { success: false, error: result.error, errorCode: "SIGNATURE_INVITATION_FAILED" };
      return {
        success: true,
        data: { documentId, documentRequestId: input.documentRequestId, envelopeId: result.envelopeId, recipientId: result.recipientId },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Signature invitation failed.",
        errorCode: "SIGNATURE_INVITATION_ERROR",
        retryable: true,
      };
    }
  },
};

// ---------------------------------------------------------------------------
// schedule_interview — create a real, conflict-checked interview
// ---------------------------------------------------------------------------

const scheduleInterviewWorkflowSchema = z.object({
  applicationId: z.string().min(1).optional(),
  candidateId: z.string().min(1).optional(),
  interviewerId: z.string().min(1).nullable().optional(),
  type: z.enum(INTERVIEW_TYPES).default("screening"),
  mode: z.enum(INTERVIEW_MODES).default("video"),
  meetingProvider: z.enum(["auto", "google_meet", "zoom", "teams", "jitsi", "external"]).default("auto"),
  scheduledAt: z.iso.datetime(),
  durationMins: z.coerce.number().int().min(5).max(480).default(45),
  title: z.string().trim().max(120).optional(),
  location: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(4000).optional(),
}).superRefine((input, context) => {
  if (input.mode !== "video" && input.meetingProvider !== "auto") {
    context.addIssue({ code: "custom", path: ["meetingProvider"], message: "Choose a video interview to select a meeting provider." });
  }
  if (input.meetingProvider === "external" && !z.url().safeParse(input.location).success) {
    context.addIssue({ code: "custom", path: ["location"], message: "Enter the external meeting URL." });
  }
});

const scheduleInterviewWorkflowHandler: ActionHandler<z.infer<typeof scheduleInterviewWorkflowSchema>> = {
  schema: scheduleInterviewWorkflowSchema,
  requiresPermission: "interviews:manage",
  label: "Schedule interview",
  summarize: (input) => `Schedule ${input.type.replaceAll("_", " ")} interview`,
  async run(input, ctx) {
    const target = effectiveTarget(ctx);
    const applicationId = target.applicationId;
    const candidateId = target.candidateId;
    if (!applicationId || !candidateId) {
      return { success: false, error: "An application and candidate are required." };
    }
    const { values } = await loadTemplateValues(ctx, target);
    try {
      const interview = await createInterviewForApi({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.actorUserId,
        workflowEffectId: ctx.effectKey,
        meetingProvider: input.meetingProvider,
        values: {
          applicationId,
          candidateId,
          interviewerId: input.interviewerId ?? null,
          type: input.type,
          mode: input.mode,
          scheduledAt: new Date(input.scheduledAt),
          durationMins: input.durationMins,
          title: input.title === undefined ? null : interpolateTemplate(input.title, values),
          location: input.location === undefined ? null : interpolateTemplate(input.location, values),
          notes: input.notes === undefined ? null : interpolateTemplate(input.notes, values),
        },
        strictSideEffects: true,
        database: ctx.database,
      });
      return {
        success: true,
        data: {
          interviewId: interview.id,
          applicationId: interview.applicationId,
          candidateId: interview.candidateId,
          scheduledAt: interview.scheduledAt.toISOString(),
          meetLink: interview.meetLink,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Interview could not be scheduled.",
        errorCode: "INTERVIEW_SCHEDULE_FAILED",
        retryable: isRetryableWorkflowError(error),
      };
    }
  },
};

// ---------------------------------------------------------------------------
// reschedule_interview / cancel_interview — provider-aware meeting lifecycle
// ---------------------------------------------------------------------------

const rescheduleInterviewWorkflowSchema = z.object({
  interviewId: z.string().min(1).optional(),
  scheduledAt: z.iso.datetime(),
  durationMins: z.coerce.number().int().min(5).max(480).optional(),
  location: z.string().trim().max(500).nullable().optional(),
});

const rescheduleInterviewWorkflowHandler: ActionHandler<z.infer<typeof rescheduleInterviewWorkflowSchema>> = {
  schema: rescheduleInterviewWorkflowSchema,
  requiresPermission: "interviews:manage",
  label: "Reschedule interview",
  summarize: (input) => `Reschedule interview to ${input.scheduledAt}`,
  async run(input, ctx) {
    const target = effectiveTarget(ctx);
    const interviewId = target.interviewId;
    if (!interviewId) {
      return { success: false, error: "An interview is required.", errorCode: "INTERVIEW_REQUIRED" };
    }
    const { values } = await loadTemplateValues(ctx, target);
    try {
      const interview = await updateInterviewForApi({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.actorUserId,
        interviewId,
        workflowEffectId: ctx.effectKey,
        values: {
          scheduledAt: new Date(input.scheduledAt),
          ...(input.durationMins !== undefined ? { durationMins: input.durationMins } : {}),
          ...(input.location !== undefined
            ? { location: input.location === null ? null : interpolateTemplate(input.location, values) }
            : {}),
        },
        strictSideEffects: true,
        database: ctx.database,
      });
      return {
        success: true,
        data: {
          interviewId: interview.id,
          applicationId: interview.applicationId,
          candidateId: interview.candidateId,
          scheduledAt: interview.scheduledAt.toISOString(),
          meetingUrl: interview.meetLink,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Interview could not be rescheduled.",
        errorCode: "INTERVIEW_RESCHEDULE_FAILED",
        retryable: isRetryableWorkflowError(error),
      };
    }
  },
};

const cancelInterviewWorkflowSchema = z.object({
  interviewId: z.string().min(1).optional(),
});

const cancelInterviewWorkflowHandler: ActionHandler<z.infer<typeof cancelInterviewWorkflowSchema>> = {
  schema: cancelInterviewWorkflowSchema,
  requiresPermission: "interviews:manage",
  label: "Cancel interview",
  summarize: () => "Cancel interview",
  async run(input, ctx) {
    const target = effectiveTarget(ctx);
    const interviewId = target.interviewId;
    if (!interviewId) {
      return { success: false, error: "An interview is required.", errorCode: "INTERVIEW_REQUIRED" };
    }
    try {
      const interview = await setInterviewStatusForApi({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.actorUserId,
        interviewId,
        status: "canceled",
        workflowEffectId: ctx.effectKey,
        strictSideEffects: true,
        database: ctx.database,
      });
      return {
        success: true,
        data: {
          interviewId: interview.id,
          applicationId: interview.applicationId,
          candidateId: interview.candidateId,
          status: interview.status,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Interview could not be canceled.",
        errorCode: "INTERVIEW_CANCEL_FAILED",
        retryable: isRetryableWorkflowError(error),
      };
    }
  },
};

// ---------------------------------------------------------------------------
// create_offer / send_offer — durable offer lifecycle
// ---------------------------------------------------------------------------

const nullableDate = z.preprocess(emptyToUndef, z.iso.datetime().nullable().optional());
const createOfferWorkflowSchema = z.object({
  applicationId: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  salaryAmount: z.preprocess(emptyToUndef, z.coerce.number().int().positive().max(100_000_000).nullable().optional()),
  currency: z.preprocess(emptyToUndef, z.string().trim().max(8).nullable().optional()),
  salaryPeriod: z.preprocess(emptyToUndef, z.enum(["annual", "monthly"]).nullable().optional()),
  equity: z.preprocess(emptyToUndef, z.string().trim().max(120).nullable().optional()),
  startDate: nullableDate,
  expiresAt: nullableDate,
  notes: z.preprocess(emptyToUndef, z.string().trim().max(5000).nullable().optional()),
});

const createOfferWorkflowHandler: ActionHandler<z.infer<typeof createOfferWorkflowSchema>> = {
  schema: createOfferWorkflowSchema,
  requiresPermission: "offers:manage",
  label: "Create offer",
  summarize: (input) => `Create offer: ${input.title}`,
  async run(input, ctx) {
    const target = effectiveTarget(ctx);
    const applicationId = target.applicationId;
    if (!applicationId) return { success: false, error: "No application in trigger payload." };
    const { values } = await loadTemplateValues(ctx, target);
    try {
      const offer = await createOfferForApi({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.actorUserId,
        applicationId,
        workflowEffectId: ctx.effectKey,
        values: {
          title: interpolateTemplate(input.title, values),
          salaryAmount: input.salaryAmount ?? null,
          currency: input.currency === undefined || input.currency === null ? null : interpolateTemplate(input.currency, values),
          salaryPeriod: input.salaryPeriod ?? null,
          equity: input.equity === undefined || input.equity === null ? null : interpolateTemplate(input.equity, values),
          startDate: input.startDate ? new Date(input.startDate) : null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          notes: input.notes === undefined || input.notes === null ? null : interpolateTemplate(input.notes, values),
        },
        database: ctx.database,
      });
      return { success: true, data: { offerId: offer.id, applicationId: offer.applicationId, status: offer.status } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Offer could not be created.", retryable: false, errorCode: "OFFER_CREATE_FAILED" };
    }
  },
};

const sendOfferWorkflowSchema = z.object({ offerId: z.string().min(1) });
const sendOfferWorkflowHandler: ActionHandler<z.infer<typeof sendOfferWorkflowSchema>> = {
  schema: sendOfferWorkflowSchema,
  requiresPermission: "offers:manage",
  label: "Send offer",
  summarize: () => "Send offer to candidate",
  async run(_input, ctx) {
    const offerId = effectiveTarget(ctx).offerId;
    if (!offerId) {
      return { success: false, error: "An offer is required.", errorCode: "OFFER_REQUIRED" };
    }
    try {
      const offer = await sendOfferForApi({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.actorUserId,
        offerId,
        workflowEffectId: ctx.effectKey,
        database: ctx.database,
      });
      return { success: true, data: { offerId: offer.id, status: offer.status } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Offer could not be sent.", retryable: true, errorCode: "OFFER_SEND_FAILED" };
    }
  },
};

// ---------------------------------------------------------------------------
// send_slack — post a custom message to the workspace's Slack/Discord channel
// ---------------------------------------------------------------------------

const sendSlackSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

const sendSlackHandler: ActionHandler<z.infer<typeof sendSlackSchema>> = {
  schema: sendSlackSchema,
  // Slack/notifications piggyback on the integrations permission.
  requiresPermission: "integrations:manage",
  label: "Send Slack/Discord message",
  summarize: (input) => `Send chat: ${input.message.slice(0, 80)}`,
  async run(input, ctx) {
    const target = effectiveTarget(ctx);
    const { values } = await loadTemplateValues(ctx, target);
    const message = interpolateTemplate(input.message, values);
    const data = {
      ...ctx.triggerPayload,
      workflowMessage: message,
      eventId: ctx.effectKey,
    };
    try {
      const delivery = await sendWorkflowChatMessage(ctx.workspaceId, ctx.triggerEvent, data, { signal: ctx.signal, database: ctx.database });
      return { success: true, data: delivery };
    } catch (error) {
      log.error(error, "[automations] send_slack failed");
      if (error instanceof WorkflowChatDeliveryUncertainError) {
        if (!error.uncertain) {
          return {
            success: false,
            error: error.message,
            errorCode: "chat_delivery_failed",
            retryable: error.retryable,
          };
        }
        return {
          success: false,
          error: error.message,
          errorCode: "chat_delivery_uncertain",
          uncertain: true,
        };
      }
      return { success: false, error: "Chat notification failed.", retryable: true, errorCode: "chat_delivery_failed" };
    }
  },
};

const sendTelegramHandler: ActionHandler<z.infer<typeof sendSlackSchema>> = {
  schema: sendSlackSchema,
  requiresPermission: "integrations:manage",
  label: "Send Telegram message",
  summarize: (input) => `Send Telegram: ${input.message.slice(0, 80)}`,
  async run(input, ctx) {
    const target = effectiveTarget(ctx);
    const { values } = await loadTemplateValues(ctx, target);
    const message = interpolateTemplate(input.message, values);
    try {
      const delivery = await sendWorkflowTelegramMessage(ctx.workspaceId, ctx.triggerEvent, {
        ...ctx.triggerPayload,
        workflowMessage: message,
      }, { signal: ctx.signal, database: ctx.database });
      return { success: true, data: delivery };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Telegram delivery failed.", errorCode: "telegram_delivery_uncertain", uncertain: true };
    }
  },
};

const sendDiscordHandler: ActionHandler<z.infer<typeof sendSlackSchema>> = {
  schema: sendSlackSchema,
  requiresPermission: "integrations:manage",
  label: "Send Discord message",
  summarize: (input) => `Send Discord: ${input.message.slice(0, 80)}`,
  async run(input, ctx) {
    const target = effectiveTarget(ctx);
    const { values } = await loadTemplateValues(ctx, target);
    const message = interpolateTemplate(input.message, values);
    try {
      const delivery = await sendWorkflowDiscordMessage(ctx.workspaceId, ctx.triggerEvent, {
        ...ctx.triggerPayload,
        workflowMessage: message,
        eventId: ctx.effectKey,
      }, { signal: ctx.signal, database: ctx.database });
      return { success: true, data: delivery };
    } catch (error) {
      if (error instanceof WorkflowChatDeliveryUncertainError && !error.uncertain) {
        return {
          success: false,
          error: error.message,
          errorCode: "discord_delivery_failed",
          retryable: error.retryable,
        };
      }
      return { success: false, error: error instanceof Error ? error.message : "Discord delivery failed.", errorCode: "discord_delivery_uncertain", uncertain: true };
    }
  },
};

// ---------------------------------------------------------------------------
// send_in_app_alert — durable Harly notification
// ---------------------------------------------------------------------------

const sendInAppAlertSchema = z.object({
  recipientUserId: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().max(2000).optional(),
  // Templates are resolved inside the tenant before this value is used. The
  // resolved value is checked again in the handler so a template cannot turn
  // an internal alert into an external redirect.
  href: z.string().trim().refine((value) => value === "" || value.startsWith("/") || value.includes("{{"), {
    message: "Alert links must be internal Harly paths or workflow templates.",
  }).optional(),
});

const sendInAppAlertHandler: ActionHandler<z.infer<typeof sendInAppAlertSchema>> = {
  schema: sendInAppAlertSchema,
  requiresPermission: "collab:write",
  label: "Create in-app alert",
  summarize: (input) => `Alert: ${input.title}`,
  async run(input, ctx) {
    const database = ctx.database ?? db;
    const target = effectiveTarget(ctx);
    const { values } = await loadTemplateValues(ctx, target);
    const recipientUserId = input.recipientUserId ?? ctx.actorUserId;
    const [recipient] = await database
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.organizationId, ctx.workspaceId),
        eq(workspaceMembers.userId, recipientUserId),
      ))
      .limit(1);
    if (!recipient) {
      return { success: false, error: "Alert recipient is not a member of this workspace.", errorCode: "ALERT_RECIPIENT_NOT_FOUND" };
    }

    const href = input.href ? interpolateTemplate(input.href, values) : undefined;
    if (href && !href.startsWith("/")) {
      return { success: false, error: "Alert links must resolve to an internal Harly path.", errorCode: "ALERT_INVALID_HREF" };
    }

    await createNotification({
      database,
      workspaceId: ctx.workspaceId,
      recipientIds: [recipient.userId],
      actorId: ctx.actorUserId,
      type: "workflow.alert",
      title: interpolateTemplate(input.title, values),
      body: input.body === undefined ? undefined : interpolateTemplate(input.body, values),
      href,
      metadata: { source: "workflow", runId: ctx.runId },
      dedupeKey: ctx.effectKey,
    });
    return { success: true, data: { recipientUserId: recipient.userId, notified: true } };
  },
};

// ---------------------------------------------------------------------------
// send_email — enqueue a candidate email via the durable outbox
// ---------------------------------------------------------------------------

const sendEmailSchema = z
  .object({
    templateId: z.preprocess(emptyToUndef, z.string().uuid().optional()),
    toEmail: z.preprocess(emptyToUndef, z.string().email().optional()),
    subject: z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
    body: z.preprocess(emptyToUndef, z.string().trim().max(10000).optional()),
    candidateId: z.preprocess(emptyToUndef, z.string().min(1).optional()),
  })
  .refine((data) => Boolean(data.templateId || (data.subject && data.body)), {
    message: "Choose an email template or write a subject and body.",
  });

const sendEmailHandler: ActionHandler<z.infer<typeof sendEmailSchema>> = {
  schema: sendEmailSchema,
  requiresPermission: "collab:write",
  label: "Send email",
  summarize: (input) =>
    input.subject ? `Send email: ${input.subject}` : "Send candidate email",
  async run(input, ctx) {
    const database = ctx.database ?? db;
    const target = effectiveTarget(ctx);
    const candidateId = target.candidateId;
    const { values, candidate, companyName } = await loadTemplateValues(ctx, {
      ...target,
      candidateId,
    });

    const toEmail = input.toEmail ?? candidate?.email;
    if (!toEmail) {
      return { success: false, error: "No recipient email found for candidate." };
    }

    let subject = input.subject ?? "";
    let body = input.body ?? "";

    if (input.templateId) {
      const [tmpl] = await database
        .select({
          subject: emailTemplates.subject,
          body: emailTemplates.body,
        })
        .from(emailTemplates)
        .where(
          and(
            eq(emailTemplates.workspaceId, ctx.workspaceId),
            eq(emailTemplates.id, input.templateId),
          ),
        )
        .limit(1);

      if (!tmpl && (!subject || !body)) {
        return { success: false, error: "Referenced email template not found." };
      }
      if (tmpl) {
        if (!subject) subject = tmpl.subject;
        if (!body) body = tmpl.body;
      }
    }

    if (!subject.trim() || !body.trim()) {
      return { success: false, error: "Email subject and body are required." };
    }

    const finalSubject = interpolateTemplate(subject, values);
    const finalBody = interpolateTemplate(body, values);

    const outboxId = await enqueueEmailOutbox(
      ctx.workspaceId,
      "automation.email",
      {
        to: toEmail,
        subject: finalSubject,
        bodyHtml: finalBody,
        candidateId: candidateId ?? null,
        companyName,
      },
      ctx.effectKey,
      ctx.actorUserId,
      database,
    );
    return { success: true, data: { outboxId, queued: true } };
  },
};

// ---------------------------------------------------------------------------
// send_booking_link — let the candidate self-schedule through Cal.com
// ---------------------------------------------------------------------------

const sendBookingLinkSchema = z.object({
  toEmail: z.preprocess(emptyToUndef, z.string().email().optional()),
  subject: z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
  body: z.preprocess(emptyToUndef, z.string().trim().max(10000).optional()),
  candidateId: z.preprocess(emptyToUndef, z.string().min(1).optional()),
});

const sendBookingLinkHandler: ActionHandler<z.infer<typeof sendBookingLinkSchema>> = {
  schema: sendBookingLinkSchema,
  requiresPermission: "collab:write",
  label: "Send booking link",
  summarize: () => "Send a self-scheduling link",
  async run(input, ctx) {
    const database = ctx.database ?? db;
    const status = await getWorkspaceCalStatus(ctx.workspaceId, database);
    if (!status.enabled || !status.bookingUrl) {
      return {
        success: false,
        error: "Cal.com is not configured. Add and enable a booking URL in Settings → Integrations.",
        errorCode: "CAL_NOT_CONFIGURED",
      };
    }
    let configuredBookingUrl: URL;
    try {
      configuredBookingUrl = new URL(status.bookingUrl);
    } catch {
      return { success: false, error: "The configured Cal.com booking URL is invalid.", errorCode: "CAL_INVALID_BOOKING_URL" };
    }
    if (configuredBookingUrl.protocol !== "https:") {
      return { success: false, error: "The Cal.com booking URL must use HTTPS.", errorCode: "CAL_INSECURE_BOOKING_URL" };
    }

    const target = effectiveTarget(ctx);
    const candidateId = target.candidateId;
    const { values, candidate, companyName } = await loadTemplateValues(ctx, { ...target, candidateId });
    const toEmail = input.toEmail ?? candidate?.email;
    if (!toEmail) return { success: false, error: "No recipient email found for candidate." };

    const name = [candidate?.firstName, candidate?.lastName].filter(Boolean).join(" ") || null;
    const bookingUrl = buildCalBookingLink({
      bookingUrl: status.bookingUrl,
      name,
      email: toEmail,
      metadata: {
        workspaceId: ctx.workspaceId,
        candidateId: candidateId ?? "",
        applicationId: target.applicationId ?? "",
      },
    });
    const subject = interpolateTemplate(input.subject ?? "Choose a time to meet with {{company_name}}", values);
    const message = interpolateTemplate(input.body ?? "Pick a time that works for you: {{booking_link}}", {
      ...values,
      booking_link: bookingUrl,
    });
    const outboxId = await enqueueEmailOutbox(
      ctx.workspaceId,
      "automation.email",
      { to: toEmail, subject, bodyHtml: `${message}<br/><br/><a href="${bookingUrl}">Choose a time</a>`, candidateId: candidateId ?? null, companyName },
      ctx.effectKey,
      ctx.actorUserId,
      database,
    );
    return { success: true, data: { outboxId, bookingUrl, queued: true } };
  },
};

// ---------------------------------------------------------------------------
// http_request — safe outbound HTTP with secret refs (§2.6, T4)
// ---------------------------------------------------------------------------

const workflowHeadersSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (!value.trim()) return undefined;
  const parsed: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(":");
    if (separator <= 0) return null;
    const key = trimmed.slice(0, separator).trim();
    const headerValue = trimmed.slice(separator + 1).trim();
    if (!key || !headerValue) return null;
    parsed[key] = headerValue;
  }
  return parsed;
}, z.record(z.string(), z.string()).optional());

const httpRequestSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
  // The builder intentionally presents headers as one line per entry. Parse
  // that editor format at the contract boundary, while retaining support for
  // structured input from the API and older workflow definitions.
  headers: workflowHeadersSchema,
  body: z.string().optional(),
  /** Secret names referenced as {{secrets.NAME}} in headers/body. */
  secretRefs: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,127}$/)).optional(),
});

const MAX_HTTP_RESPONSE_BYTES = 64 * 1024;

/**
 * Read at most `limit` bytes from an untrusted response. `Response.text()`
 * buffers the entire stream before callers can slice it, which made the old
 * preview cap ineffective for a large or malicious endpoint.
 */
async function readLimitedResponseBody(
  response: Response,
  limit = MAX_HTTP_RESPONSE_BYTES,
): Promise<{ ok: true; text: string } | { ok: false }> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false };
  }
  if (!response.body) return { ok: true, text: "" };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return { ok: false };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bytes) };
}

const SECRET_PLACEHOLDER_REGEX = /\{\{\s*secrets\.([^}]+)\}\}/g;
const SECRET_NAME_REGEX = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;

/** Replace {{secrets.NAME}} occurrences with decrypted workspace secret values. */
async function injectSecrets(
  workspaceId: string,
  text: string,
  refs: string[] | undefined,
  database: typeof db = db,
): Promise<{ value: string; missing: string[]; invalid: string[] }> {
  const detected = [...text.matchAll(SECRET_PLACEHOLDER_REGEX)].map((match) => match[1]!.trim());
  const invalid = [...new Set(detected.filter((name) => !SECRET_NAME_REGEX.test(name)))];
  const required = [...new Set([
    ...(refs ?? []),
    ...detected.filter((name) => SECRET_NAME_REGEX.test(name)),
  ])];
  if (required.length === 0) return { value: text, missing: [], invalid };
  const rows = await database
    .select({ name: workspaceSecrets.name, ciphertext: workspaceSecrets.secretCiphertext, iv: workspaceSecrets.secretIv, tag: workspaceSecrets.secretTag })
    .from(workspaceSecrets)
    .where(and(
      eq(workspaceSecrets.workspaceId, workspaceId),
      inArray(workspaceSecrets.name, required),
    ))
    .limit(required.length);
  const byName = new Map(rows.map((r) => [r.name, r]));
  const missing: string[] = [];
  let value = text;
  for (const ref of required) {
    const row = byName.get(ref);
    if (!row) {
      missing.push(ref);
      continue;
    }
    const plaintext = decryptSecret({ ciphertext: row.ciphertext, iv: row.iv, tag: row.tag });
    const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    value = value.replace(new RegExp(`\\{\\{\\s*secrets\\.${escaped}\\s*\\}\\}`, "g"), plaintext);
  }
  return { value, missing, invalid };
}

const httpRequestHandler: ActionHandler<z.infer<typeof httpRequestSchema>> = {
  schema: httpRequestSchema,
  requiresPermission: "integrations:manage",
  label: "HTTP request",
  summarize: (input) => `${input.method} ${input.url}`,
  async run(input, ctx) {
    if (isDemoMode()) {
      return { success: true, data: { suppressed: true, reason: "demo_mode" } };
    }
    const database = ctx.database ?? db;
    const target = effectiveTarget(ctx);
    const { values } = await loadTemplateValues(ctx, target);
    try {
      const headerEntries = await Promise.all(
        Object.entries(input.headers ?? {}).map(async ([key, val]) => {
          const templated = interpolateTemplate(val, values);
          const { value, missing, invalid } = await injectSecrets(ctx.workspaceId, templated, input.secretRefs, database);
          if (missing.length > 0 || invalid.length > 0) return { key, val: null as string | null, missing, invalid };
          return { key, val: value, missing: [] as string[], invalid: [] as string[] };
        }),
      );
      const missingSecrets = headerEntries.flatMap((h) => h.missing);
      const invalidSecretPlaceholders = headerEntries.flatMap((h) => h.invalid);
      let body = input.body === undefined ? undefined : interpolateTemplate(input.body, values);
      if (body !== undefined) {
        const injected = await injectSecrets(ctx.workspaceId, body, input.secretRefs, database);
        body = injected.value;
        missingSecrets.push(...injected.missing);
        invalidSecretPlaceholders.push(...injected.invalid);
      }
      if (invalidSecretPlaceholders.length > 0) {
        return { success: false, error: `Invalid workspace secret placeholders: ${[...new Set(invalidSecretPlaceholders)].join(", ")}`, errorCode: "INVALID_SECRET_PLACEHOLDER" };
      }
      if (missingSecrets.length > 0) {
        return { success: false, error: `Missing workspace secrets: ${[...new Set(missingSecrets)].join(", ")}` };
      }

      const headers = new Headers();
      for (const entry of headerEntries) {
        if (entry.val !== null) headers.set(entry.key, entry.val);
      }
      if (!headers.has("Idempotency-Key")) headers.set("Idempotency-Key", ctx.effectKey);

      const timeout = AbortSignal.timeout(10_000);
      const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;
      const response = await safeFetchWebhook(input.url, {
        method: input.method,
        headers,
        body,
        signal,
      });
      const responseBody = await readLimitedResponseBody(response);
      if (!responseBody.ok) {
        return {
          success: false,
          error: `HTTP response exceeded the ${MAX_HTTP_RESPONSE_BYTES} byte limit.`,
          errorCode: "RESPONSE_TOO_LARGE",
          data: { status: response.status },
        };
      }
      return {
        success: response.ok,
        error: response.ok ? undefined : `HTTP ${response.status}`,
        errorCode: response.ok ? undefined : response.status === 429 ? "rate_limited" : response.status >= 500 ? "provider_5xx" : "provider_4xx",
        retryable: !response.ok && response.status === 429,
        uncertain: !response.ok && response.status >= 500,
        // The persisted preview remains intentionally small; unlike the old
        // implementation the complete body was never buffered first.
        data: { status: response.status, body: responseBody.text.slice(0, 500) },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      return { success: false, error: message, errorCode: "network_error", uncertain: true };
    }
  },
};

// ---------------------------------------------------------------------------
// The registry itself
// ---------------------------------------------------------------------------

function tool(
  type: ActionType,
  handler: AnyActionHandler,
  metadata: Omit<
    AutomationToolDescriptor,
    "type" | "version" | "schema" | "run" | "label" | "summarize" | "requiresPermission" | "outputSchema" | "targetPolicy"
  >,
): AutomationToolDescriptor {
  const descriptor = { ...handler, type, version: 1, ...metadata };
  return {
    ...descriptor,
    outputSchema: actionOutputSchema(type),
    targetPolicy: descriptor.targetFields.length === 0 ? "trigger" : "trigger_or_override",
  };
}

/**
 * Output contracts are intentionally explicit instead of inferred from a
 * string list. They are enforced on real handler results and simulation
 * fixtures, so an output binding cannot be advertised by the editor but
 * silently absent at runtime.
 */
function actionOutputSchema(type: ActionType): z.ZodType<unknown> {
  const id = z.string().min(1);
  const nullableUrl = z.string().url().nullable();
  switch (type) {
    case "move_stage":
      return z.object({ applicationId: id, toStageId: id }).passthrough();
    case "set_status":
      return z.object({ applicationId: id, status: z.string().min(1) }).passthrough();
    case "add_note":
      return z.object({ noteId: id.optional(), candidateId: id }).passthrough();
    case "add_tag":
    case "remove_tag":
      return z.object({ candidateId: id, label: z.string().min(1) }).passthrough();
    case "request_documents":
      return z.object({
        applicationId: id,
        candidateId: id,
        packageId: id,
        primaryRequestId: id.nullable(),
        requestIds: z.array(id),
        reused: z.boolean(),
      }).passthrough();
    case "generate_document":
      return z.object({
        documentId: id,
        documentVersionId: id,
        applicationId: id,
        candidateId: id,
        reused: z.boolean(),
      }).passthrough();
    case "send_document_for_signature":
      return z.object({
        documentId: id,
        documentRequestId: id.optional(),
        envelopeId: id,
        recipientId: id,
      }).passthrough();
    case "schedule_interview":
      return z.object({
        interviewId: id,
        applicationId: id,
        candidateId: id,
        scheduledAt: z.iso.datetime(),
        meetLink: nullableUrl,
      }).passthrough();
    case "reschedule_interview":
      return z.object({
        interviewId: id,
        applicationId: id,
        candidateId: id,
        scheduledAt: z.iso.datetime(),
        meetingUrl: nullableUrl,
      }).passthrough();
    case "cancel_interview":
      return z.object({ interviewId: id, applicationId: id, candidateId: id, status: z.string().min(1) }).passthrough();
    case "create_offer":
      return z.object({ offerId: id, applicationId: id, status: z.string().min(1) }).passthrough();
    case "send_offer":
      return z.object({ offerId: id, status: z.string().min(1) }).passthrough();
    case "create_task":
      return z.object({ taskId: id }).passthrough();
    case "erase_candidate_data":
      return z.object({
        candidateId: id,
        deletionJobId: id,
        queued: z.boolean(),
        status: z.string().min(1),
      }).passthrough();
    case "send_slack":
      return z.object({ provider: z.string().min(1), queued: z.boolean() }).passthrough();
    case "send_telegram":
    case "send_discord":
      return z.object({ provider: z.string().min(1) }).passthrough();
    case "send_in_app_alert":
      return z.object({ recipientUserId: id, notified: z.literal(true) }).passthrough();
    case "send_email":
      return z.object({ outboxId: id, queued: z.literal(true) }).passthrough();
    case "send_booking_link":
      return z.object({ outboxId: id, bookingUrl: z.string().url(), queued: z.literal(true) }).passthrough();
    case "http_request":
      return z.object({ status: z.number().int().min(100).max(599), body: z.string() }).passthrough();
    case "ai_score":
      return z.object({
        applicationId: id,
        score: z.number(),
        recommendation: z.string(),
        evaluationId: id.optional(),
      }).passthrough();
  }
  throw new Error(`Missing output contract for action type: ${type}`);
}

const TOOL_V1: Partial<Record<ActionType, AutomationToolDescriptor>> = {
  move_stage: tool("move_stage", erase(moveStageHandler), { category: "candidate", effect: "internal_write", simulation: "fixture", targetFields: ["applicationId"], outputFields: ["applicationId", "toStageId"], integrationRequirements: [] }),
  set_status: tool("set_status", erase(setStatusHandler), { category: "candidate", effect: "internal_write", simulation: "fixture", targetFields: ["applicationId"], outputFields: ["applicationId", "status"], integrationRequirements: [] }),
  ai_score: tool("ai_score", erase(aiScoreWorkflowHandler), { category: "candidate", effect: "internal_write", simulation: "fixture", targetFields: ["applicationId"], outputFields: ["applicationId", "score", "recommendation", "evaluationId"], integrationRequirements: [] }),
  erase_candidate_data: tool("erase_candidate_data", erase(eraseCandidateDataWorkflowHandler), { category: "candidate", effect: "internal_write", simulation: "fixture", targetFields: ["candidateId"], outputFields: ["candidateId", "deletionJobId", "queued", "status"], integrationRequirements: [] }),
  add_note: tool("add_note", erase(addNoteHandler), { category: "candidate", effect: "internal_write", simulation: "stateful", targetFields: ["candidateId"], outputFields: ["noteId", "candidateId"], integrationRequirements: [] }),
  add_tag: tool("add_tag", erase(addTagHandler), { category: "candidate", effect: "internal_write", simulation: "stateful", targetFields: ["candidateId"], outputFields: ["candidateId", "label"], integrationRequirements: [] }),
  remove_tag: tool("remove_tag", erase(removeTagHandler), { category: "candidate", effect: "internal_write", simulation: "stateful", targetFields: ["candidateId"], outputFields: ["candidateId", "label"], integrationRequirements: [] }),
  request_documents: tool("request_documents", erase(requestDocumentsWorkflowHandler), { category: "documents", effect: "internal_write", simulation: "fixture", targetFields: ["applicationId"], outputFields: ["applicationId", "candidateId", "packageId", "primaryRequestId", "requestIds", "reused"], integrationRequirements: [] }),
  generate_document: tool("generate_document", erase(generateDocumentWorkflowHandler), { category: "documents", effect: "internal_write", simulation: "fixture", targetFields: ["applicationId"], outputFields: ["documentId", "documentVersionId", "applicationId", "candidateId", "reused"], integrationRequirements: [] }),
  send_document_for_signature: tool("send_document_for_signature", erase(sendDocumentForSignatureHandler), { category: "documents", effect: "external_write", simulation: "fixture", targetFields: ["applicationId", "candidateId"], outputFields: ["documentId", "documentRequestId", "envelopeId", "recipientId"], integrationRequirements: [] }),
  schedule_interview: tool("schedule_interview", erase(scheduleInterviewWorkflowHandler), { category: "interviews", effect: "external_write", simulation: "fixture", targetFields: ["applicationId", "candidateId", "jobId"], outputFields: ["interviewId", "applicationId", "candidateId", "scheduledAt", "meetLink"], integrationRequirements: ["meeting_provider"] }),
  reschedule_interview: tool("reschedule_interview", erase(rescheduleInterviewWorkflowHandler), { category: "interviews", effect: "external_write", simulation: "fixture", targetFields: ["interviewId"], outputFields: ["interviewId", "applicationId", "candidateId", "scheduledAt", "meetingUrl"], integrationRequirements: ["meeting_provider"] }),
  cancel_interview: tool("cancel_interview", erase(cancelInterviewWorkflowHandler), { category: "interviews", effect: "external_write", simulation: "fixture", targetFields: ["interviewId"], outputFields: ["interviewId", "applicationId", "candidateId", "status"], integrationRequirements: [] }),
  create_offer: tool("create_offer", erase(createOfferWorkflowHandler), { category: "offers", effect: "internal_write", simulation: "fixture", targetFields: ["applicationId"], outputFields: ["offerId", "applicationId", "status"], integrationRequirements: [] }),
  send_offer: tool("send_offer", erase(sendOfferWorkflowHandler), { category: "offers", effect: "external_write", simulation: "fixture", targetFields: ["offerId"], outputFields: ["offerId", "status"], integrationRequirements: [] }),
  create_task: tool("create_task", erase(createTaskHandler), { category: "tasks", effect: "internal_write", simulation: "fixture", targetFields: ["applicationId", "candidateId", "jobId"], outputFields: ["taskId"], integrationRequirements: [] }),
  send_slack: tool("send_slack", erase(sendSlackHandler), { category: "messaging", effect: "external_write", simulation: "fixture", targetFields: [], outputFields: ["provider", "queued"], integrationRequirements: ["slack"] }),
  send_telegram: tool("send_telegram", erase(sendTelegramHandler), { category: "messaging", effect: "external_write", simulation: "fixture", targetFields: [], outputFields: ["provider"], integrationRequirements: ["telegram"] }),
  send_discord: tool("send_discord", erase(sendDiscordHandler), { category: "messaging", effect: "external_write", simulation: "fixture", targetFields: [], outputFields: ["provider"], integrationRequirements: ["discord"] }),
  send_in_app_alert: tool("send_in_app_alert", erase(sendInAppAlertHandler), { category: "messaging", effect: "internal_write", simulation: "fixture", targetFields: [], outputFields: ["recipientUserId", "notified"], integrationRequirements: [] }),
  send_email: tool("send_email", erase(sendEmailHandler), { category: "messaging", effect: "external_write", simulation: "fixture", targetFields: ["candidateId"], outputFields: ["outboxId", "queued"], integrationRequirements: ["email"] }),
  send_booking_link: tool("send_booking_link", erase(sendBookingLinkHandler), { category: "messaging", effect: "external_write", simulation: "fixture", targetFields: ["candidateId", "applicationId"], outputFields: ["outboxId", "bookingUrl", "queued"], integrationRequirements: ["cal"] }),
  http_request: tool("http_request", erase(httpRequestHandler), { category: "integrations", effect: "external_write", simulation: "fixture", targetFields: [], outputFields: ["status", "body"], integrationRequirements: [] }),
};

/** Versioned server registry. New contracts are additive; published v1 tools never drift. */
export const ACTION_TOOL_REGISTRY: Partial<
  Record<ActionType, ReadonlyMap<number, AutomationToolDescriptor>>
> = Object.fromEntries(
  Object.entries(TOOL_V1).map(([type, descriptor]) => [
    type,
    new Map([[1, descriptor!]]),
  ]),
) as Partial<Record<ActionType, ReadonlyMap<number, AutomationToolDescriptor>>>;

/** Legacy v1 runner compatibility. New graph code must call getAutomationTool. */
export const ACTION_REGISTRY: Partial<Record<ActionType, AnyActionHandler>> = Object.fromEntries(
  Object.entries(TOOL_V1).map(([type, descriptor]) => [type, descriptor!]),
) as Partial<Record<ActionType, AnyActionHandler>>;

export function getAutomationTool(
  type: ActionType,
  version: number,
): AutomationToolDescriptor | undefined {
  return ACTION_TOOL_REGISTRY[type]?.get(version);
}

export function listAutomationToolManifests(): AutomationToolManifest[] {
  return Object.values(ACTION_TOOL_REGISTRY)
    .flatMap((versions) => [...(versions?.values() ?? [])])
    .map((tool) => ({
      type: tool.type,
      version: tool.version,
      label: tool.label,
      requiresPermission: tool.requiresPermission,
      category: tool.category,
      effect: tool.effect,
      simulation: tool.simulation,
      targetPolicy: tool.targetPolicy,
      targetFields: tool.targetFields,
      outputFields: tool.outputFields,
      integrationRequirements: tool.integrationRequirements,
    }));
}

export function getActionHandler(type: ActionType): AnyActionHandler | undefined {
  return getAutomationTool(type, 1);
}

/** All action types that have a registered handler (for the builder UI). */
export function registeredActionTypes(): ActionType[] {
  return Object.keys(ACTION_REGISTRY) as ActionType[];
}

export {
  listAutomationToolManifestsV2,
  getAutomationToolManifestV2,
  type AutomationToolManifestV2,
  type AutomationToolInputDescriptor,
  type AutomationToolOutputDescriptor,
} from "./tool-manifests-v2";

/** Re-exported helper for tests / the engine. */
export { asString };
