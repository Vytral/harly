import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import {
  applications,
  candidates,
  db,
  emailTemplates,
  jobs,
  organization,
  rejectionReasons,
} from "@harly/db";
import { candidateRejectedSubject } from "@harly/emails";

import { interpolateTemplate } from "@/features/email-templates/interpolate";
import { templateHtmlToPlainText } from "@/features/email-templates/plain-text";
import { sanitizeTemplateHtml } from "@/features/email-templates/template-html.server";

import {
  DEFAULT_REJECTION_REASONS,
  LEGACY_REJECTION_REASON_CODE,
  type RejectionEmailPreview,
  type RejectionReasonOption,
  type RejectionTemplateOption,
} from "./shared";

type Database = typeof db;

/**
 * Seed the default catalog the first time a workspace touches rejection
 * reasons. Idempotent: conflicts on (workspace, code) are ignored, and a
 * workspace that already has any reason is left exactly as its admins set it.
 */
export async function ensureRejectionReasons(
  workspaceId: string,
  database: Database = db,
): Promise<void> {
  const [existing] = await database
    .select({ id: rejectionReasons.id })
    .from(rejectionReasons)
    .where(eq(rejectionReasons.workspaceId, workspaceId))
    .limit(1);
  if (existing) return;
  await database
    .insert(rejectionReasons)
    .values(
      DEFAULT_REJECTION_REASONS.map((reason, index) => ({
        workspaceId,
        code: reason.code,
        label: reason.label,
        position: index,
      })),
    )
    .onConflictDoNothing({
      target: [rejectionReasons.workspaceId, rejectionReasons.code],
    });
}

/** The workspace's catalog in display order, archived reasons last. */
export async function listRejectionReasons(
  workspaceId: string,
  options: { includeArchived?: boolean; database?: Database } = {},
): Promise<RejectionReasonOption[]> {
  const database = options.database ?? db;
  await ensureRejectionReasons(workspaceId, database);
  const rows = await database
    .select({
      code: rejectionReasons.code,
      label: rejectionReasons.label,
      archivedAt: rejectionReasons.archivedAt,
    })
    .from(rejectionReasons)
    .where(
      options.includeArchived
        ? eq(rejectionReasons.workspaceId, workspaceId)
        : and(
            eq(rejectionReasons.workspaceId, workspaceId),
            isNull(rejectionReasons.archivedAt),
          ),
    )
    .orderBy(asc(rejectionReasons.position), asc(rejectionReasons.createdAt));
  return rows
    .map((row) => ({
      code: row.code,
      label: row.label,
      archived: row.archivedAt !== null,
    }))
    .sort((a, b) => Number(a.archived) - Number(b.archived));
}

/** code → label for every reason, archived included (history keeps its label). */
export async function rejectionReasonLabels(
  workspaceId: string,
  database: Database = db,
): Promise<Map<string, string>> {
  const rows = await database
    .select({ code: rejectionReasons.code, label: rejectionReasons.label })
    .from(rejectionReasons)
    .where(eq(rejectionReasons.workspaceId, workspaceId));
  return new Map(rows.map((row) => [row.code, row.label]));
}

/**
 * Resolve a reason for a new rejection. Explicit codes must be an active
 * reason in the catalog. The legacy default ("Other") is always accepted so
 * API and AI callers keep working even if an admin archived it.
 */
export async function resolveRejectionReason(
  workspaceId: string,
  code: string | undefined,
  database: Database = db,
): Promise<{ code: string; label: string } | null> {
  const wanted = code ?? LEGACY_REJECTION_REASON_CODE;
  await ensureRejectionReasons(workspaceId, database);
  const [row] = await database
    .select({
      code: rejectionReasons.code,
      label: rejectionReasons.label,
      archivedAt: rejectionReasons.archivedAt,
    })
    .from(rejectionReasons)
    .where(
      and(
        eq(rejectionReasons.workspaceId, workspaceId),
        eq(rejectionReasons.code, wanted),
      ),
    )
    .limit(1);
  if (row && (!row.archivedAt || wanted === LEGACY_REJECTION_REASON_CODE)) {
    return { code: row.code, label: row.label };
  }
  if (!row && wanted === LEGACY_REJECTION_REASON_CODE) {
    return { code: LEGACY_REJECTION_REASON_CODE, label: "Other" };
  }
  return null;
}

/** Rejection-type email templates; the active one is the default choice. */
export async function listRejectionTemplates(
  workspaceId: string,
  database: Database = db,
): Promise<RejectionTemplateOption[]> {
  const rows = await database
    .select({
      id: emailTemplates.id,
      name: emailTemplates.name,
      isActive: emailTemplates.isActive,
    })
    .from(emailTemplates)
    .where(
      and(
        eq(emailTemplates.workspaceId, workspaceId),
        eq(emailTemplates.type, "rejection"),
      ),
    )
    .orderBy(asc(emailTemplates.name));
  return rows.sort((a, b) => Number(b.isActive) - Number(a.isActive));
}

/** A rejection template that belongs to the workspace, or null. */
export async function getRejectionTemplate(
  workspaceId: string,
  templateId: string,
  database: Database = db,
): Promise<{ id: string; subject: string; body: string } | null> {
  const [row] = await database
    .select({
      id: emailTemplates.id,
      subject: emailTemplates.subject,
      body: emailTemplates.body,
    })
    .from(emailTemplates)
    .where(
      and(
        eq(emailTemplates.workspaceId, workspaceId),
        eq(emailTemplates.id, templateId),
        eq(emailTemplates.type, "rejection"),
      ),
    )
    .limit(1);
  return row ?? null;
}

function splitName(fullName: string) {
  const [first = "", ...rest] = fullName.trim().split(/\s+/);
  return { first, last: rest.join(" ") };
}

/** Text body of Harly's built-in rejection email (mirrors CandidateRejected). */
export function builtInRejectionBody(input: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
}): string {
  return [
    `Hi ${input.candidateName},`,
    `Thank you for applying to ${input.jobTitle} at ${input.companyName}. After careful consideration, we've decided to move forward with other candidates.`,
    `Thanks,\n${input.companyName}`,
  ].join("\n\n");
}

/**
 * What the candidate of `applicationId` would receive for `templateId`, with
 * variables filled the same way the outbox fills them at send time
 * (deliverPipelineEmail). `templateId`: an id, `null` for the built-in email,
 * `undefined` for the workspace's active rejection template.
 */
export async function buildRejectionEmailPreview(
  input: {
    workspaceId: string;
    applicationId: string;
    templateId: string | null | undefined;
  },
  database: Database = db,
): Promise<RejectionEmailPreview | null> {
  const [row] = await database
    .select({
      candidateEmail: candidates.email,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      jobTitle: jobs.title,
      workspaceName: organization.name,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(organization, eq(organization.id, applications.workspaceId))
    .where(
      and(
        eq(applications.workspaceId, input.workspaceId),
        eq(applications.id, input.applicationId),
      ),
    )
    .limit(1);
  if (!row) return null;

  const candidateName = `${row.firstName} ${row.lastName}`.trim();
  const { first, last } = splitName(candidateName);

  let template: { subject: string; body: string } | null = null;
  if (typeof input.templateId === "string") {
    template = await getRejectionTemplate(input.workspaceId, input.templateId, database);
  } else if (input.templateId === undefined) {
    const [active] = await database
      .select({ subject: emailTemplates.subject, body: emailTemplates.body })
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.workspaceId, input.workspaceId),
          eq(emailTemplates.type, "rejection"),
          eq(emailTemplates.isActive, true),
        ),
      )
      .limit(1);
    template = active ?? null;
  }

  if (template) {
    const values = {
      candidate_first_name: first,
      candidate_last_name: last,
      candidate_full_name: candidateName,
      job_title: row.jobTitle,
      company_name: row.workspaceName,
    };
    return {
      to: row.candidateEmail,
      candidateName,
      subject: interpolateTemplate(template.subject, values),
      body: templateHtmlToPlainText(
        sanitizeTemplateHtml(interpolateTemplate(template.body, values)),
      ),
    };
  }

  return {
    to: row.candidateEmail,
    candidateName,
    subject: candidateRejectedSubject({
      jobTitle: row.jobTitle,
      companyName: row.workspaceName,
    }),
    body: builtInRejectionBody({
      candidateName,
      jobTitle: row.jobTitle,
      companyName: row.workspaceName,
    }),
  };
}
