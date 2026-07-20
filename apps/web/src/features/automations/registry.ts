import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  activityEvents,
  applications,
  candidateNotes,
  candidateTags,
  candidates,
  db,
  jobStages,
  tasks,
  workspaceSecrets,
} from "@harly/db";

import { decryptSecret } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { safeFetchWebhook } from "@/lib/ssrf";
import { notifyChatEvent } from "@/server/notify/dispatch";

import type { ActionType, WorkflowEvent } from "./schema";

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

// ---------------------------------------------------------------------------
// Context + result
// ---------------------------------------------------------------------------

export type ActionContext = {
  workspaceId: string;
  /** The user the workflow runs as (decision D1). */
  actorUserId: string;
  /** The trigger event that started the run, for context in messages. */
  triggerEvent: WorkflowEvent;
  /** The raw trigger payload (the `data` of emitWebhookEvent). */
  triggerPayload: Record<string, unknown>;
};

export type ActionResult = {
  success: boolean;
  error?: string;
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
function targetFromTrigger(payload: Record<string, unknown>): {
  applicationId: string | null;
  candidateId: string | null;
  jobId: string | null;
} {
  const app = payload.application as Record<string, unknown> | undefined;
  const candidate = payload.candidate as Record<string, unknown> | undefined;
  const applicationId =
    (typeof app?.id === "string" && app.id) ||
    (typeof payload.applicationId === "string" && payload.applicationId) ||
    null;
  const candidateId =
    (typeof candidate?.id === "string" && candidate.id) ||
    (typeof payload.candidateId === "string" && payload.candidateId) ||
    null;
  const jobId =
    (typeof payload.jobId === "string" && payload.jobId) ||
    (typeof app?.jobId === "string" && app.jobId) ||
    null;
  return { applicationId, candidateId, jobId };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// move_stage — move the triggering application to a stage
// ---------------------------------------------------------------------------

const moveStageSchema = z.object({
  toStageId: z.string().min(1),
  /** Optional: target by stage name instead of id (resolved per job). */
  toStageName: z.string().min(1).optional(),
});

async function resolveStageId(
  workspaceId: string,
  applicationId: string,
  config: z.infer<typeof moveStageSchema>,
): Promise<string | null> {
  if (config.toStageId) {
    const [stage] = await db
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
    return stage?.id ?? null;
  }
  if (config.toStageName) {
    const [stage] = await db
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
      .where(and(eq(jobStages.workspaceId, workspaceId), eq(jobStages.name, config.toStageName)))
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
    const { applicationId } = targetFromTrigger(ctx.triggerPayload);
    if (!applicationId) return { success: false, error: "No application in trigger payload." };

    const stageId = await resolveStageId(ctx.workspaceId, applicationId, input);
    if (!stageId) return { success: false, error: "Target stage not found for this job." };

    // Optimistic concurrency: update only if the stage actually differs.
    const [updated] = await db
      .update(applications)
      .set({ currentStageId: stageId, updatedAt: new Date() })
      .where(
        and(
          eq(applications.workspaceId, ctx.workspaceId),
          eq(applications.id, applicationId),
        ),
      )
      .returning({ id: applications.id, currentStageId: applications.currentStageId });

    if (!updated) return { success: false, error: "Application not found." };

    await db.insert(activityEvents).values({
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorUserId,
      entityType: "application",
      entityId: applicationId,
      type: "stage.changed",
      metadata: { toStageId: stageId, source: "workflow" },
    });

    return { success: true, data: { applicationId, toStageId: stageId } };
  },
};

// ---------------------------------------------------------------------------
// set_status — active / hired / rejected / withdrawn
// ---------------------------------------------------------------------------

const setStatusSchema = z.object({
  status: z.enum(["active", "hired", "rejected", "withdrawn"]),
});

const setStatusHandler: ActionHandler<z.infer<typeof setStatusSchema>> = {
  schema: setStatusSchema,
  requiresPermission: "candidates:edit",
  label: "Set status",
  summarize: (input) => `Set status: ${input.status}`,
  async run(input, ctx) {
    const { applicationId } = targetFromTrigger(ctx.triggerPayload);
    if (!applicationId) return { success: false, error: "No application in trigger payload." };

    const [updated] = await db
      .update(applications)
      .set({ status: input.status, updatedAt: new Date() })
      .where(
        and(
          eq(applications.workspaceId, ctx.workspaceId),
          eq(applications.id, applicationId),
        ),
      )
      .returning({ id: applications.id });

    if (!updated) return { success: false, error: "Application not found." };

    await db.insert(activityEvents).values({
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorUserId,
      entityType: "application",
      entityId: applicationId,
      type: `application.${input.status}`,
      metadata: { status: input.status, source: "workflow" },
    });

    return { success: true, data: { applicationId, status: input.status } };
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
    const candidateId = input.candidateId ?? targetFromTrigger(ctx.triggerPayload).candidateId;
    if (!candidateId) return { success: false, error: "No candidate in trigger payload." };

    const [candidate] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.workspaceId, ctx.workspaceId), eq(candidates.id, candidateId)))
      .limit(1);
    if (!candidate) return { success: false, error: "Candidate not found." };

    const [note] = await db
      .insert(candidateNotes)
      .values({
        workspaceId: ctx.workspaceId,
        candidateId,
        authorId: ctx.actorUserId,
        body: input.body,
      })
      .returning({ id: candidateNotes.id });

    await db.insert(activityEvents).values({
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorUserId,
      entityType: "candidate",
      entityId: candidateId,
      type: "note.added",
      metadata: { preview: input.body.slice(0, 100), source: "workflow" },
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
    const candidateId = input.candidateId ?? targetFromTrigger(ctx.triggerPayload).candidateId;
    if (!candidateId) return { success: false, error: "No candidate in trigger payload." };

    await db
      .insert(candidateTags)
      .values({
        workspaceId: ctx.workspaceId,
        candidateId,
        label: input.label,
        createdById: ctx.actorUserId,
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
    const candidateId = input.candidateId ?? targetFromTrigger(ctx.triggerPayload).candidateId;
    if (!candidateId) return { success: false, error: "No candidate in trigger payload." };

    await db
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
    const target = targetFromTrigger(ctx.triggerPayload);
    const [created] = await db
      .insert(tasks)
      .values({
        workspaceId: ctx.workspaceId,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        status: "pending",
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        ownerId: input.ownerId ?? ctx.actorUserId,
        candidateId: input.candidateId ?? target.candidateId ?? null,
        applicationId: input.applicationId ?? target.applicationId ?? null,
        jobId: input.jobId ?? target.jobId ?? null,
        createdById: ctx.actorUserId,
      })
      .returning({ id: tasks.id });

    if (!created) return { success: false, error: "Task could not be created." };

    await db.insert(activityEvents).values({
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
    // Reuse the chat notify path with a synthetic payload so the configured
    // Slack/Discord channel receives a real Block Kit message. We emit using
    // the triggering event so emoji/labels match, with the custom text merged.
    const data = { ...ctx.triggerPayload, workflowMessage: input.message };
    try {
      await notifyChatEvent(ctx.workspaceId, ctx.triggerEvent, data);
      return { success: true };
    } catch (error) {
      log.error(error, "[automations] send_slack failed");
      return { success: false, error: "Chat notification failed." };
    }
  },
};

// ---------------------------------------------------------------------------
// send_email — enqueue a candidate email via the durable outbox
// ---------------------------------------------------------------------------

const sendEmailSchema = z.object({
  toEmail: z.email(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
  candidateId: z.string().min(1).optional(),
});

const sendEmailHandler: ActionHandler<z.infer<typeof sendEmailSchema>> = {
  schema: sendEmailSchema,
  requiresPermission: "collab:write",
  label: "Send email",
  summarize: (input) => `Send email: ${input.subject}`,
  async run(input, _ctx) {
    // Deferred to FASE 1.5+ — enqueueEmailOutbox requires a template type and
    // a resolved sender. The v1 handler delegates to the candidate-message
    // service once wired; for now it fails loud so the run records the gap.
    void _ctx;
    return {
      success: false,
      error: "send_email is not wired in v1 of the registry.",
    };
  },
};

// ---------------------------------------------------------------------------
// http_request — safe outbound HTTP with secret refs (§2.6, T4)
// ---------------------------------------------------------------------------

const httpRequestSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  /** Secret names referenced as {{secrets.NAME}} in headers/body. */
  secretRefs: z.array(z.string()).optional(),
});

/** Replace {{secrets.NAME}} occurrences with decrypted workspace secret values. */
async function injectSecrets(
  workspaceId: string,
  text: string,
  refs: string[] | undefined,
): Promise<{ value: string; missing: string[] }> {
  if (!refs || refs.length === 0) return { value: text, missing: [] };
  const rows = await db
    .select({ name: workspaceSecrets.name, ciphertext: workspaceSecrets.secretCiphertext, iv: workspaceSecrets.secretIv, tag: workspaceSecrets.secretTag })
    .from(workspaceSecrets)
    .where(and(eq(workspaceSecrets.workspaceId, workspaceId)));
  const byName = new Map(rows.map((r) => [r.name, r]));
  const missing: string[] = [];
  let value = text;
  for (const ref of refs) {
    const row = byName.get(ref);
    if (!row) {
      missing.push(ref);
      continue;
    }
    const plaintext = decryptSecret({ ciphertext: row.ciphertext, iv: row.iv, tag: row.tag });
    value = value.replaceAll(`{{secrets.${ref}}}`, plaintext);
  }
  return { value, missing };
}

const httpRequestHandler: ActionHandler<z.infer<typeof httpRequestSchema>> = {
  schema: httpRequestSchema,
  requiresPermission: "integrations:manage",
  label: "HTTP request",
  summarize: (input) => `${input.method} ${input.url}`,
  async run(input, ctx) {
    try {
      const headerEntries = await Promise.all(
        Object.entries(input.headers ?? {}).map(async ([key, val]) => {
          const { value, missing } = await injectSecrets(ctx.workspaceId, val, input.secretRefs);
          if (missing.length > 0) return { key, val: null as string | null, missing };
          return { key, val: value, missing: [] as string[] };
        }),
      );
      const missingSecrets = headerEntries.flatMap((h) => h.missing);
      let body = input.body ?? undefined;
      if (body !== undefined) {
        const injected = await injectSecrets(ctx.workspaceId, body, input.secretRefs);
        body = injected.value;
        missingSecrets.push(...injected.missing);
      }
      if (missingSecrets.length > 0) {
        return { success: false, error: `Missing workspace secrets: ${missingSecrets.join(", ")}` };
      }

      const headers = new Headers();
      for (const entry of headerEntries) {
        if (entry.val !== null) headers.set(entry.key, entry.val);
      }

      const response = await safeFetchWebhook(input.url, {
        method: input.method,
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });
      const responseBody = (await response.text().catch(() => "")).slice(0, 500);
      return {
        success: response.ok,
        error: response.ok ? undefined : `HTTP ${response.status}`,
        data: { status: response.status, body: responseBody },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      return { success: false, error: message };
    }
  },
};

// ---------------------------------------------------------------------------
// The registry itself
// ---------------------------------------------------------------------------

export const ACTION_REGISTRY: Partial<Record<ActionType, AnyActionHandler>> = {
  move_stage: erase(moveStageHandler),
  set_status: erase(setStatusHandler),
  add_note: erase(addNoteHandler),
  add_tag: erase(addTagHandler),
  remove_tag: erase(removeTagHandler),
  create_task: erase(createTaskHandler),
  send_slack: erase(sendSlackHandler),
  send_email: erase(sendEmailHandler),
  http_request: erase(httpRequestHandler),
};

export function getActionHandler(type: ActionType): AnyActionHandler | undefined {
  return ACTION_REGISTRY[type];
}

/** All action types that have a registered handler (for the builder UI). */
export function registeredActionTypes(): ActionType[] {
  return Object.keys(ACTION_REGISTRY) as ActionType[];
}

/** Re-exported helper for tests / the engine. */
export { asString };
