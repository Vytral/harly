import "server-only";

import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";

import {
  applications,
  candidateTags,
  candidates,
  db,
  documents,
  emailTemplates,
  interviews,
  jobs,
  jobStages,
  member as authMembers,
  user as authUsers,
  workflowWebhookEndpoints,
  workflowDocumentTemplates,
} from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";
import { createLogger } from "@/lib/logger";
import type { WorkflowDocumentTemplateSnapshot } from "@/features/document-templates/shared";

import {
  loadConditionContext,
  evaluateConditions,
  type ConditionContext,
  matchesTriggerFilter,
} from "./conditions";
import { type Trigger } from "./schema";
import { validateWorkflowWebhookPayload } from "./webhook-schema";
import { validateWebhookSimulationPayload } from "./webhook-simulation";
import {
  BUILDER_SEARCH_PAGE_SIZE,
  sanitizeSearchQuery,
  type BuilderSearchItem,
  type BuilderSearchKind,
} from "./builder/search-kinds";
import { simulate } from "./runtime/simulate";
import {
  defaultSimulationFixture,
  type SimulationPreset,
} from "./runtime/simulation-fixtures";
import { validateGraphActionInputs } from "./publish-validation";
import { listAutomationToolManifests } from "./registry";
import { simulationFixturesSchema } from "./runtime/simulate";
import { outputPorts } from "./definition/ports";
import {
  jsonValueSchema,
  parseGraph,
  type JsonValue,
  type WorkflowGraphV2,
  type WorkflowNode,
} from "./definition/schema-v2";
import type { NodeOutcome } from "./runtime/advance";

const log = createLogger("automations");

function applyVirtualAutomationAction(
  state: unknown,
  node: Extract<WorkflowNode, { type: "action" }>,
  input: Record<string, JsonValue>,
  output: JsonValue,
) {
  if (!state || typeof state !== "object") return;
  const context = state as ConditionContext;
  const candidate = context.candidate;
  const application = context.application;
  if (node.actionType === "add_tag" && candidate) {
    const label = input.label;
    if (typeof label !== "string" || !label.trim()) return;
    const tags = Array.isArray(candidate.tags)
      ? candidate.tags.filter((tag): tag is string => typeof tag === "string")
      : [];
    if (!tags.includes(label)) candidate.tags = [...tags, label];
    return;
  }
  if (node.actionType === "remove_tag" && candidate) {
    const label = input.label;
    if (typeof label !== "string") return;
    const tags = Array.isArray(candidate.tags)
      ? candidate.tags.filter((tag): tag is string => typeof tag === "string")
      : [];
    candidate.tags = tags.filter((tag) => tag !== label);
    return;
  }
  if (node.actionType === "set_status" && application) {
    const status = input.status;
    if (typeof status === "string") application.status = status;
    return;
  }
  if (node.actionType === "move_stage" && application) {
    const value = output && typeof output === "object" && !Array.isArray(output)
      ? output as Record<string, JsonValue>
      : {};
    const stageId = value.toStageId ?? input.toStageId;
    if (typeof stageId === "string") application.currentStageId = stageId;
    return;
  }
  if (node.actionType === "ai_score") {
    context.ai = {
      score: 85,
      recommendation: "strong_yes",
      summary: "Candidate matches job requirements.",
      tags: ["qualified"],
    };
    return;
  }
}

function validTimeZone(value: string | null | undefined): value is string {
  if (!value?.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

/**
 * Server-side data the builder needs that can't be derived client-side:
 *  - the workspace's members (for the create_task assignee picker)
 *  - distinct stage names across all jobs (for the move_stage picker)
 *  - active jobs (for filtering WHEN / IF by job)
 *  - email templates (for the send_email template picker)
 *  - active unsigned PDFs (for the signature document picker)
 *  - active PDFs with checksums (for immutable generated-document attachments)
 *  - active reusable document templates (for generated workflow documents)
 *  - candidate tags (for the add_tag / remove_tag picker)
 *  - the editor user's IANA timezone (used to seed local-time delays)
 *  - candidate search is paginated on demand (never the last 100 of the workspace)
 */
export async function getBuilderData(workflowId?: string) {
  const context = await getWorkspaceContext();
  const workspaceId = context.organization.id;

  const [
    members,
    stageRows,
    jobRows,
    templateRows,
    documentRows,
    attachmentDocumentRows,
    documentTemplateRows,
    interviewRows,
    tagRows,
    webhookEndpointRows,
    actorProfile,
  ] = await Promise.all([
    db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        role: authMembers.role,
      })
      .from(authMembers)
      .innerJoin(authUsers, eq(authUsers.id, authMembers.userId))
      .where(eq(authMembers.organizationId, workspaceId))
      .orderBy(
        sql`case ${authMembers.role} when 'owner' then 0 when 'admin' then 1 when 'recruiter' then 2 else 3 end`,
        authUsers.name,
      )
      .limit(50),
    db
      .select({
        id: jobStages.id,
        name: jobStages.name,
        jobId: jobStages.jobId,
      })
      .from(jobStages)
      .where(eq(jobStages.workspaceId, workspaceId))
      .orderBy(asc(jobStages.order), asc(jobStages.name))
      .limit(80),
    db
      .select({ id: jobs.id, title: jobs.title })
      .from(jobs)
      .where(and(eq(jobs.workspaceId, workspaceId), isNull(jobs.deletedAt)))
      .orderBy(asc(jobs.title))
      .limit(40),
    db
      .select({
        id: emailTemplates.id,
        name: emailTemplates.name,
        subject: emailTemplates.subject,
        type: emailTemplates.type,
      })
      .from(emailTemplates)
      .where(eq(emailTemplates.workspaceId, workspaceId))
      .orderBy(asc(emailTemplates.name))
      .limit(40),
    db
      .select({
        id: documents.id,
        name: documents.name,
        mimeType: documents.mimeType,
      })
      .from(documents)
      .where(
        and(
          eq(documents.workspaceId, workspaceId),
          eq(documents.status, "active"),
          eq(documents.signatureStatus, "unsigned"),
          eq(documents.mimeType, "application/pdf"),
        ),
      )
      .orderBy(asc(documents.name))
      .limit(40),
    db
      .select({
        id: documents.id,
        name: documents.name,
        mimeType: documents.mimeType,
        checksum: documents.checksum,
      })
      .from(documents)
      .where(
        and(
          eq(documents.workspaceId, workspaceId),
          eq(documents.status, "active"),
          eq(documents.mimeType, "application/pdf"),
        ),
      )
      .orderBy(asc(documents.name))
      .limit(40),
    db
      .select({
        id: workflowDocumentTemplates.id,
        name: workflowDocumentTemplates.name,
        title: workflowDocumentTemplates.title,
        body: workflowDocumentTemplates.body,
        format: workflowDocumentTemplates.format,
      })
      .from(workflowDocumentTemplates)
      .where(
        and(
          eq(workflowDocumentTemplates.workspaceId, workspaceId),
          isNull(workflowDocumentTemplates.archivedAt),
        ),
      )
      .orderBy(asc(workflowDocumentTemplates.name))
      .limit(40),
    db
      .select({
        id: interviews.id,
        title: interviews.title,
        type: interviews.type,
        scheduledAt: interviews.scheduledAt,
        candidateFirstName: candidates.firstName,
        candidateLastName: candidates.lastName,
        jobTitle: jobs.title,
      })
      .from(interviews)
      .innerJoin(candidates, eq(candidates.id, interviews.candidateId))
      .innerJoin(jobs, eq(jobs.id, interviews.jobId))
      .where(
        and(
          eq(interviews.workspaceId, workspaceId),
          eq(interviews.status, "scheduled"),
        ),
      )
      .orderBy(asc(interviews.scheduledAt))
      .limit(40),
    db
      .select({ label: candidateTags.label })
      .from(candidateTags)
      .where(eq(candidateTags.workspaceId, workspaceId))
      .limit(80),
    workflowId
      ? db
          .select({
            id: workflowWebhookEndpoints.id,
            name: workflowWebhookEndpoints.name,
            enabled: workflowWebhookEndpoints.enabled,
            lastReceivedAt: workflowWebhookEndpoints.lastReceivedAt,
            payloadSchema: workflowWebhookEndpoints.payloadSchema,
          })
          .from(workflowWebhookEndpoints)
          .where(
            and(
              eq(workflowWebhookEndpoints.workspaceId, workspaceId),
              eq(workflowWebhookEndpoints.workflowId, workflowId),
            ),
          )
          .orderBy(asc(workflowWebhookEndpoints.name))
          .limit(40)
      : Promise.resolve(
          [] as Array<{
            id: string;
            name: string;
            enabled: boolean;
            lastReceivedAt: Date | null;
            payloadSchema: Record<string, unknown>;
          }>,
        ),
    db
      .select({ timezone: authUsers.timezone })
      .from(authUsers)
      .where(eq(authUsers.id, context.user.id))
      .limit(1),
  ]);

  const stageNames = Array.from(new Set(stageRows.map((r) => r.name))).sort();
  const stages = stageRows.map((row) => ({
    id: row.id,
    name: row.name,
    jobId: row.jobId,
  }));

  // Distinct candidate tags
  const tags = Array.from(new Set(tagRows.map((r) => r.label)))
    .filter(Boolean)
    .sort();

  return {
    toolManifests: listAutomationToolManifests(),
    members: members.map((m) => ({
      id: m.id,
      name: m.name || m.email,
      email: m.email,
      role: m.role,
    })),
    stageNames,
    stages,
    jobs: jobRows.map((j) => ({ id: j.id, title: j.title })),
    emailTemplates: templateRows.map((t) => ({
      id: t.id,
      name: t.name,
      subject: t.subject,
      type: t.type,
    })),
    documents: documentRows.map((document) => ({
      id: document.id,
      name: document.name,
      mimeType: document.mimeType,
    })),
    attachmentDocuments: attachmentDocumentRows.map((document) => ({
      id: document.id,
      name: document.name,
      mimeType: document.mimeType,
      checksum: document.checksum,
    })),
    documentTemplates: documentTemplateRows.map(
      (template): WorkflowDocumentTemplateSnapshot => ({
        id: template.id,
        name: template.name,
        title: template.title,
        body: template.body,
        format: template.format,
      }),
    ),
    interviews: interviewRows.map((interview) => ({
      id: interview.id,
      label:
        interview.title ||
        `${interview.type.replaceAll("_", " ")} · ${[interview.candidateFirstName, interview.candidateLastName].filter(Boolean).join(" ")}`,
      hint: `${interview.scheduledAt.toISOString().slice(0, 16).replace("T", " ")} UTC · ${interview.jobTitle}`,
    })),
    tags,
    webhookEndpoints: webhookEndpointRows.map((endpoint) => ({
      id: endpoint.id,
      name: endpoint.name,
      enabled: endpoint.enabled,
      lastReceivedAt: endpoint.lastReceivedAt?.toISOString() ?? null,
      payloadSchema: endpoint.payloadSchema as Record<string, unknown>,
    })),
    defaultTimeZone: validTimeZone(actorProfile[0]?.timezone)
      ? actorProfile[0]!.timezone!.trim()
      : "UTC",
    candidates: [] as Array<{ id: string; name: string; email: string }>,
    userName: context.user.name || "Recruiter",
  };
}

function like(query: string): string {
  return `%${sanitizeSearchQuery(query)}%`;
}

function pageOffset(cursor?: string): number {
  const parsed = Number.parseInt(cursor ?? "0", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function paged<T>(
  rows: T[],
  offset: number,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > BUILDER_SEARCH_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, BUILDER_SEARCH_PAGE_SIZE) : rows;
  return {
    items,
    nextCursor: hasMore ? String(offset + BUILDER_SEARCH_PAGE_SIZE) : null,
  };
}

/**
 * Paginated, workspace-scoped lookups for inspector selectors.
 * Workspace comes from the session, never from the client payload.
 */
export async function searchBuilderOptions(input: {
  kind: BuilderSearchKind;
  query?: string;
  id?: string;
  jobId?: string;
  cursor?: string;
}): Promise<{ items: BuilderSearchItem[]; nextCursor: string | null }> {
  const context = await getWorkspaceContext();
  const workspaceId = context.organization.id;
  const needle = sanitizeSearchQuery(input.query ?? "");
  const exactId = input.id?.trim() || undefined;
  const offset = pageOffset(input.cursor);
  const limit = BUILDER_SEARCH_PAGE_SIZE + 1;

  if (input.kind === "jobs") {
    const rows = await db
      .select({ id: jobs.id, title: jobs.title })
      .from(jobs)
      .where(
        and(
          eq(jobs.workspaceId, workspaceId),
          isNull(jobs.deletedAt),
          exactId
            ? eq(jobs.id, exactId)
            : needle
              ? ilike(jobs.title, like(needle))
              : undefined,
        ),
      )
      .orderBy(asc(jobs.title))
      .limit(limit)
      .offset(offset);
    return paged(
      rows.map((row) => ({ id: row.id, label: row.title })),
      offset,
    );
  }

  if (input.kind === "members") {
    const rows = await db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
      })
      .from(authMembers)
      .innerJoin(authUsers, eq(authUsers.id, authMembers.userId))
      .where(
        and(
          eq(authMembers.organizationId, workspaceId),
          exactId
            ? eq(authUsers.id, exactId)
            : needle
              ? or(
                  ilike(authUsers.name, like(needle)),
                  ilike(authUsers.email, like(needle)),
                )
              : undefined,
        ),
      )
      .orderBy(authUsers.name)
      .limit(limit)
      .offset(offset);
    return paged(
      rows.map((row) => ({
        id: row.id,
        label: row.name || row.email,
        hint: row.email,
      })),
      offset,
    );
  }

  if (input.kind === "templates") {
    const rows = await db
      .select({
        id: emailTemplates.id,
        name: emailTemplates.name,
        type: emailTemplates.type,
      })
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.workspaceId, workspaceId),
          exactId
            ? eq(emailTemplates.id, exactId)
            : needle
              ? ilike(emailTemplates.name, like(needle))
              : undefined,
        ),
      )
      .orderBy(asc(emailTemplates.name))
      .limit(limit)
      .offset(offset);
    return paged(
      rows.map((row) => ({ id: row.id, label: row.name, hint: row.type })),
      offset,
    );
  }

  if (input.kind === "documents") {
    const rows = await db
      .select({
        id: documents.id,
        name: documents.name,
        mimeType: documents.mimeType,
      })
      .from(documents)
      .where(
        and(
          eq(documents.workspaceId, workspaceId),
          eq(documents.status, "active"),
          eq(documents.signatureStatus, "unsigned"),
          eq(documents.mimeType, "application/pdf"),
          exactId
            ? eq(documents.id, exactId)
            : needle
              ? ilike(documents.name, like(needle))
              : undefined,
        ),
      )
      .orderBy(asc(documents.name))
      .limit(limit)
      .offset(offset);
    return paged(
      rows.map((row) => ({ id: row.id, label: row.name, hint: row.mimeType })),
      offset,
    );
  }

  if (input.kind === "interviews") {
    const rows = await db
      .select({
        id: interviews.id,
        title: interviews.title,
        type: interviews.type,
        scheduledAt: interviews.scheduledAt,
        candidateFirstName: candidates.firstName,
        candidateLastName: candidates.lastName,
        jobTitle: jobs.title,
      })
      .from(interviews)
      .innerJoin(candidates, eq(candidates.id, interviews.candidateId))
      .innerJoin(jobs, eq(jobs.id, interviews.jobId))
      .where(
        and(
          eq(interviews.workspaceId, workspaceId),
          eq(interviews.status, "scheduled"),
          exactId
            ? eq(interviews.id, exactId)
            : needle
              ? or(
                  ilike(interviews.title, like(needle)),
                  ilike(candidates.firstName, like(needle)),
                  ilike(candidates.lastName, like(needle)),
                  ilike(jobs.title, like(needle)),
                )
              : undefined,
        ),
      )
      .orderBy(asc(interviews.scheduledAt))
      .limit(limit)
      .offset(offset);
    return paged(
      rows.map((interview) => ({
        id: interview.id,
        label:
          interview.title ||
          `${interview.type.replaceAll("_", " ")} · ${[interview.candidateFirstName, interview.candidateLastName].filter(Boolean).join(" ")}`,
        hint: `${interview.scheduledAt.toISOString().slice(0, 16).replace("T", " ")} UTC · ${interview.jobTitle}`,
      })),
      offset,
    );
  }

  if (input.kind === "tags") {
    const rows = await db
      .select({ label: candidateTags.label })
      .from(candidateTags)
      .where(
        and(
          eq(candidateTags.workspaceId, workspaceId),
          exactId
            ? eq(candidateTags.label, exactId)
            : needle
              ? ilike(candidateTags.label, like(needle))
              : undefined,
        ),
      )
      .orderBy(asc(candidateTags.label))
      .limit(limit)
      .offset(offset);
    return paged(
      rows.map((row) => ({ id: row.label, label: row.label })),
      offset,
    );
  }

  if (input.kind === "candidates") {
    const rows = await db
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
      })
      .from(candidates)
      .where(
        and(
          eq(candidates.workspaceId, workspaceId),
          isNull(candidates.deletedAt),
          exactId
            ? eq(candidates.id, exactId)
            : needle
              ? or(
                  ilike(candidates.firstName, like(needle)),
                  ilike(candidates.lastName, like(needle)),
                  ilike(candidates.email, like(needle)),
                )
              : undefined,
        ),
      )
      .orderBy(desc(candidates.updatedAt))
      .limit(limit)
      .offset(offset);
    return paged(
      rows.map((row) => ({
        id: row.id,
        label: `${row.firstName} ${row.lastName}`.trim() || row.email,
        hint: row.email,
      })),
      offset,
    );
  }

  const jobFilter = input.jobId
    ? and(
        eq(jobStages.workspaceId, workspaceId),
        eq(jobStages.jobId, input.jobId),
      )
    : eq(jobStages.workspaceId, workspaceId);
  const rows = await db
    .select({ id: jobStages.id, name: jobStages.name, jobId: jobStages.jobId })
    .from(jobStages)
    .where(
      and(
        jobFilter,
        exactId
          ? eq(jobStages.id, exactId)
          : needle
            ? ilike(jobStages.name, like(needle))
            : undefined,
      ),
    )
    .orderBy(asc(jobStages.order), asc(jobStages.name))
    .limit(limit)
    .offset(offset);
  return paged(
    rows.map((row) => ({ id: row.id, label: row.name })),
    offset,
  );
}

export type BuilderData = Awaited<ReturnType<typeof getBuilderData>>;

export async function previewWorkflowPayload(input: {
  candidateId?: string;
  trigger: Trigger;
}): Promise<Record<string, unknown>> {
  const context = await getWorkspaceContext();
  const sample = await resolveSample(
    context.organization.id,
    input.candidateId,
  );
  if (!sample) throw new Error("No candidate found to preview.");

  const [candidate] = await db
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
    })
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, context.organization.id),
        eq(candidates.id, sample.candidateId),
        isNull(candidates.deletedAt),
      ),
    )
    .limit(1);
  if (!candidate) throw new Error("Candidate not found.");

  const [application] = sample.applicationId
    ? await db
        .select({
          id: applications.id,
          candidateId: applications.candidateId,
          jobId: applications.jobId,
          source: applications.source,
          status: applications.status,
          currentStageId: applications.currentStageId,
          stageName: jobStages.name,
          jobTitle: jobs.title,
        })
        .from(applications)
        .leftJoin(jobStages, eq(jobStages.id, applications.currentStageId))
        .leftJoin(jobs, eq(jobs.id, applications.jobId))
        .where(
          and(
            eq(applications.workspaceId, context.organization.id),
            eq(applications.id, sample.applicationId),
          ),
        )
        .limit(1)
    : [];

  const payload: Record<string, unknown> = {
    event: input.trigger.event,
    workspaceId: context.organization.id,
    candidateId: candidate.id,
    candidate: {
      id: candidate.id,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
    },
  };
  if (application) {
    payload.applicationId = application.id;
    payload.jobId = application.jobId;
    payload.application = {
      id: application.id,
      candidateId: application.candidateId,
      jobId: application.jobId,
      source: application.source,
      status: application.status,
      currentStageId: application.currentStageId,
    };
    if (application.stageName) {
      payload.toStageId = application.currentStageId;
      payload.toStageName = application.stageName;
      payload.toStage = {
        id: application.currentStageId,
        name: application.stageName,
      };
    }
    payload.job = { id: application.jobId, title: application.jobTitle };
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Dry-run (T5) — evaluate a draft against a sample candidate, no side effects
// ---------------------------------------------------------------------------

/**
 * Pick a realistic sample to dry-run against: the workspace's most recently
 * updated candidate, resolved to their latest application.
 */
async function resolveSample(workspaceId: string, candidateId?: string) {
  let candId = candidateId;
  if (!candId) {
    const [latest] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.workspaceId, workspaceId),
          isNull(candidates.deletedAt),
        ),
      )
      .orderBy(desc(candidates.updatedAt))
      .limit(1);
    if (!latest) return null;
    candId = latest.id;
  }

  // Latest application for this candidate, to load full context.
  const [app] = await db
    .select({ id: applications.id, jobId: applications.jobId })
    .from(applications)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, applications.candidateId),
        eq(candidates.workspaceId, workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      jobs,
      and(
        eq(jobs.id, applications.jobId),
        eq(jobs.workspaceId, workspaceId),
        isNull(jobs.deletedAt),
      ),
    )
    .where(
      and(
        eq(applications.workspaceId, workspaceId),
        eq(applications.candidateId, candId),
      ),
    )
    .orderBy(desc(applications.updatedAt))
    .limit(1);

  return {
    candidateId: candId,
    applicationId: app?.id ?? null,
    jobId: app?.jobId ?? null,
  };
}

export type DryRunScenario = SimulationPreset;

export type DryRunStep = {
  nodeId: string;
  title: string;
  type: WorkflowNode["type"];
  status:
    | "simulated"
    | "matched"
    | "failed"
    | "uncertain"
    | "skipped"
    | "needs_fixture";
  detail: string;
  /** Synthetic clock metadata; absent for skipped/invalid nodes. */
  virtualTime?: string;
  waitedMs?: number;
};

export type DryRunResult = {
  matched: boolean;
  triggerMatched: boolean;
  steps: DryRunStep[];
  terminal:
    | "succeeded"
    | "completed_with_warnings"
    | "stopped"
    | "failed"
    | "uncertain"
    | "cancelled"
    | "needs_fixture"
    | "invalid";
  error?: string;
};

function titleForNode(node: WorkflowNode): string {
  if (node.name?.trim()) return node.name.trim();
  if (node.type === "trigger") return "Trigger";
  if (node.type === "condition") return "Condition";
  if (node.type === "action") return node.actionType;
  if (node.type === "delay") return "Wait";
  if (node.type === "approval") return "Approval";
  if (node.type === "wait")
    return node.kind === "document_package" ? "Document package" : "Event wait";
  return "End";
}

function stepsFromSimulation(
  graph: WorkflowGraphV2,
  simulation: ReturnType<typeof simulate>,
): DryRunStep[] {
  if (simulation.type === "invalid") {
    return graph.nodes.map((node) => ({
      nodeId: node.id,
      title: titleForNode(node),
      type: node.type,
      status: "skipped",
      detail: "The graph is invalid, so no step was simulated.",
    }));
  }
  const visited = new Set(simulation.trace.map((row) => row.nodeId));
  const traceByNode = new Map(simulation.trace.map((row) => [row.nodeId, row]));
  const needsFixtureId =
    simulation.type === "needs_fixture" ? simulation.nodeId : null;
  const ordered = graph.nodes.filter(
    (node) => visited.has(node.id) || node.id === needsFixtureId,
  );
  const skipped = graph.nodes.filter(
    (node) => !visited.has(node.id) && node.id !== needsFixtureId,
  );
  const result = [...ordered, ...skipped];
  return result.map((node) => {
    const outcome = simulation.snapshot.outcomes[node.id];
    const trace = traceByNode.get(node.id);
    if (node.id === needsFixtureId) {
      return {
        nodeId: node.id,
        title: titleForNode(node),
        type: node.type,
        status: "needs_fixture",
        detail: "This step needs an explicit simulation result.",
        virtualTime: trace?.virtualTime,
      };
    }
    if (!visited.has(node.id)) {
      return {
        nodeId: node.id,
        title: titleForNode(node),
        type: node.type,
        status: "skipped",
        detail: "Not reached by the selected branch.",
      };
    }
    if (node.type === "condition") {
      const matched = Boolean(
        outcome?.status === "succeeded" &&
        typeof outcome.output === "object" &&
        outcome.output !== null &&
        !Array.isArray(outcome.output) &&
        (outcome.output as Record<string, JsonValue>).matched,
      );
      return {
        nodeId: node.id,
        title: titleForNode(node),
        type: node.type,
        status: "matched",
        detail: matched
          ? "Condition matched; followed the true branch."
          : "Condition did not match; followed the false branch.",
        virtualTime: trace?.virtualTime,
      };
    }
    if (outcome?.status === "uncertain") {
      return {
        nodeId: node.id,
        title: titleForNode(node),
        type: node.type,
        status: "uncertain",
        detail: `Stopped safely: ${outcome.code}.`,
        virtualTime: trace?.virtualTime,
      };
    }
    if (outcome?.status === "failed") {
      return {
        nodeId: node.id,
        title: titleForNode(node),
        type: node.type,
        status: "failed",
        detail: `Simulated failure: ${outcome.code}.`,
        virtualTime: trace?.virtualTime,
      };
    }
    if (node.type === "trigger")
      return {
        nodeId: node.id,
        title: titleForNode(node),
        type: node.type,
        status: "matched",
        detail: "Trigger matched the sample event.",
        virtualTime: trace?.virtualTime,
      };
    return {
      nodeId: node.id,
      title: titleForNode(node),
      type: node.type,
      status: "simulated",
      detail: trace?.waitedMs
        ? `Would run here; virtual clock advanced ${Math.round(trace.waitedMs / 60000)} min. No external side effect was performed.`
        : "Would run here; no external side effect was performed.",
      virtualTime: trace?.virtualTime,
      waitedMs: trace?.waitedMs,
    };
  });
}

/**
 * Evaluate the current graph draft against a real sample candidate. The graph
 * simulator is deliberately effect-free: every action/wait receives an
 * explicit synthetic outcome and no registry, provider, or mutation is called.
 */
export async function dryRunWorkflow(input: {
  graph: WorkflowGraphV2;
  workflowId?: string;
  candidateId?: string;
  webhookPayload?: unknown;
  scenario?: DryRunScenario;
  fixtures?: Record<string, NodeOutcome>;
  startedAt?: string;
}): Promise<DryRunResult> {
  let context;
  try {
    context = await getWorkspaceContext();
  } catch {
    return {
      matched: false,
      triggerMatched: false,
      steps: [],
      terminal: "invalid",
      error: "Not authenticated.",
    };
  }

  let graph: WorkflowGraphV2;
  try {
    graph = parseGraph(input.graph);
  } catch (error) {
    return {
      matched: false,
      triggerMatched: false,
      steps: [],
      terminal: "invalid",
      error: error instanceof Error ? error.message : "Invalid workflow draft.",
    };
  }

  try {
    if (
      input.startedAt &&
      !Number.isFinite(new Date(input.startedAt).getTime())
    ) {
      return {
        matched: false,
        triggerMatched: false,
        steps: [],
        terminal: "invalid",
        error: "Virtual start must be a valid date and time.",
      };
    }
    // The simulator is effect-free, but it must still reject a graph that the
    // production runtime cannot execute. Otherwise the default synthetic
    // fixtures could make an unavailable action look like a successful test.
    const { getAutomationTool } = await import("./registry");
    const unavailable = graph.nodes
      .filter(
        (node): node is Extract<WorkflowNode, { type: "action" }> =>
          node.type === "action" && !getAutomationTool(node.actionType, node.toolVersion),
      )
      .map((node) => `${node.actionType} (${node.id})`);
    if (unavailable.length > 0) {
      return {
        matched: false,
        triggerMatched: false,
        steps: graph.nodes.map((node) => ({
          nodeId: node.id,
          title: titleForNode(node),
          type: node.type,
          status: "skipped",
          detail:
            "The graph contains an action that is not available in this runtime.",
        })),
        terminal: "invalid",
        error: `Unavailable action${unavailable.length === 1 ? "" : "s"}: ${unavailable.join(", ")}.`,
      };
    }
    const triggerNode = graph.nodes.find((node) => node.type === "trigger");
    if (!triggerNode || triggerNode.type !== "trigger") {
      return {
        matched: false,
        triggerMatched: false,
        steps: [],
        terminal: "invalid",
        error: "The graph has no trigger.",
      };
    }

    // Webhook-triggered workflows are valid in an empty workspace. Only ask
    // for a candidate sample when the event or a later condition actually
    // needs domain context.
    const sample = triggerNode.event === "webhook.received"
      ? null
      : await resolveSample(context.organization.id, input.candidateId);
    if (!sample && triggerNode.event !== "webhook.received") {
      return {
        matched: false,
        triggerMatched: false,
        steps: [],
        terminal: "invalid",
        error: "No candidate found to test against. Create a candidate first.",
      };
    }

    let triggerPayload: Record<string, JsonValue>;
    if (triggerNode.event === "webhook.received") {
      const endpointId =
        typeof triggerNode.filter?.endpointId === "string"
          ? triggerNode.filter.endpointId
          : "";
      if (!input.workflowId || !endpointId) {
        return {
          matched: false,
          triggerMatched: false,
          steps: [],
          terminal: "invalid",
          error:
            "Save the workflow and choose its inbound endpoint before testing a webhook trigger.",
        };
      }

      const [endpoint] = await db
        .select({
          id: workflowWebhookEndpoints.id,
          payloadSchema: workflowWebhookEndpoints.payloadSchema,
        })
        .from(workflowWebhookEndpoints)
        .where(
          and(
            eq(workflowWebhookEndpoints.id, endpointId),
            eq(workflowWebhookEndpoints.workspaceId, context.organization.id),
            eq(workflowWebhookEndpoints.workflowId, input.workflowId),
          ),
        )
        .limit(1);
      if (!endpoint) {
        return {
          matched: false,
          triggerMatched: false,
          steps: [],
          terminal: "invalid",
          error:
            "The selected webhook endpoint does not belong to this workflow.",
        };
      }

      const payloadResult = validateWebhookSimulationPayload(
        input.webhookPayload,
      );
      if (!payloadResult.valid) {
        return {
          matched: false,
          triggerMatched: false,
          steps: [],
          terminal: "invalid",
          error: payloadResult.error,
        };
      }
      const schemaResult = validateWorkflowWebhookPayload(
        endpoint.payloadSchema,
        payloadResult.payload,
      );
      if (!schemaResult.valid) {
        return {
          matched: false,
          triggerMatched: false,
          steps: [],
          terminal: "invalid",
          error:
            schemaResult.kind === "schema"
              ? "The selected endpoint has an invalid payload schema."
              : `Webhook payload does not match the endpoint schema: ${schemaResult.issues.join("; ")}`,
        };
      }

      // Match the event data created by webhook ingress so trigger bindings,
      // filters, and conditions see the same envelope as a production run.
      triggerPayload = jsonValueSchema.parse({
        eventId: "dry-run-event",
        endpointId: endpoint.id,
        externalEventId: "dry-run-event",
        payload: payloadResult.payload,
      }) as Record<string, JsonValue>;
    } else {
      const payload = await previewWorkflowPayload({
        candidateId: sample!.candidateId,
        trigger: { event: triggerNode.event, filter: triggerNode.filter },
      });
      triggerPayload = jsonValueSchema.parse(payload) as Record<
        string,
        JsonValue
      >;
    }
    if (!matchesTriggerFilter(triggerNode.filter, triggerPayload)) {
      return {
        matched: false,
        triggerMatched: false,
        steps: graph.nodes.map((node) => ({
          nodeId: node.id,
          title: titleForNode(node),
          type: node.type,
          status: "skipped",
          detail: "The sample event did not pass the trigger filter.",
        })),
        terminal: "stopped",
      };
    }

    const ctx = await loadConditionContext({
      workspaceId: context.organization.id,
      applicationId: sample?.applicationId ?? null,
      candidateId: sample?.candidateId ?? null,
      jobId: sample?.jobId ?? null,
      trigger: triggerPayload,
    });

    const fixtures = input.fixtures
      ? parseSimulationFixtures(graph, input.fixtures)
      : Object.fromEntries(
          graph.nodes
            .filter(
              (node) =>
                node.type === "action" ||
                node.type === "delay" ||
                node.type === "approval" ||
                node.type === "wait",
            )
            .map((node) => [
              node.id,
              defaultSimulationFixture(node, input.scenario ?? "success"),
            ]),
        );
    const virtualContext = structuredClone(ctx);
    const simulation = simulate({
      graph,
      trigger: triggerPayload,
      fixtures,
      preflightIssues: validateGraphActionInputs(graph, getAutomationTool),
      validateResolvedActionInput: (node, value) => {
        const tool = getAutomationTool(node.actionType, node.toolVersion);
        if (!tool) {
          return [{
            nodeId: node.id,
            fieldPath: "actionType",
            message: `${node.actionType} tool version ${node.toolVersion} is not available to run.`,
          }];
        }
        const parsed = tool.schema.safeParse(value);
        if (parsed.success) return [];
        return parsed.error.issues.map((issue) => ({
          nodeId: node.id,
          fieldPath: issue.path.length
            ? `input.${issue.path.map(String).join(".")}`
            : "input",
          message: issue.message,
        }));
      },
      validateFixtureOutput: (node, output) => {
        const tool = getAutomationTool(node.actionType, node.toolVersion);
        if (!tool) return [];
        const parsed = tool.outputSchema.safeParse(output);
        if (parsed.success) return [];
        return parsed.error.issues.map((issue) => ({
          nodeId: node.id,
          fieldPath: issue.path.length
            ? `fixture.output.${issue.path.map(String).join(".")}`
            : "fixture.output",
          message: issue.message,
        }));
      },
      virtualState: virtualContext,
      evaluateCondition: (tree, state) =>
        evaluateConditions(tree, (state as ConditionContext) ?? virtualContext)
          .matched,
      applyVirtualAction: (node, value, outcome, state) =>
        applyVirtualAutomationAction(
          state,
          node,
          value,
          outcome.output,
        ),
      startedAt: input.startedAt,
    });
    const steps = stepsFromSimulation(graph, simulation);
    const matched =
      simulation.type !== "invalid" && simulation.type !== "needs_fixture";
    return {
      matched,
      triggerMatched: true,
      steps,
      terminal:
        simulation.type === "finished"
          ? simulation.result.status
          : simulation.type,
      error:
        simulation.type === "invalid"
          ? simulation.issues.map((issue) => issue.message).join(" ")
          : undefined,
    };
  } catch (error) {
    log.error(error, "[automations] dryRunWorkflow failed");
    return {
      matched: false,
      triggerMatched: false,
      steps: [],
      terminal: "invalid",
      error: error instanceof Error ? error.message : "Dry-run failed.",
    };
  }
}

function parseSimulationFixtures(
  graph: WorkflowGraphV2,
  input: Record<string, NodeOutcome>,
): Record<string, NodeOutcome> {
  const parsed = simulationFixturesSchema.parse(input);
  const runnable = new Map(
    graph.nodes
      .filter(
        (node) =>
          node.type === "action" ||
          node.type === "delay" ||
          node.type === "approval" ||
          node.type === "wait",
      )
      .map((node) => [node.id, node]),
  );
  for (const [nodeId, outcome] of Object.entries(parsed)) {
    const node = runnable.get(nodeId);
    if (!node)
      throw new Error(
        `Fixture references a node that cannot receive a provider result: ${nodeId}.`,
      );
    if (
      outcome.status === "succeeded" &&
      outcome.port &&
      !outputPorts(node).includes(outcome.port)
    ) {
      throw new Error(
        `Fixture for ${nodeId} uses an invalid output port: ${outcome.port}.`,
      );
    }
  }
  return parsed;
}
