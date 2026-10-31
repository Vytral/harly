import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import {
  applications,
  candidates,
  db,
  jobStages,
  jobs,
  offers,
  organization,
  user as authUsers,
  workflowDocumentTemplates,
} from "@harly/db";

import {
  TEMPLATE_VARIABLES,
  findUnknownVariables,
  interpolateTemplate,
  type TemplateValues,
} from "@/features/email-templates/interpolate";
import { sanitizeTemplateHtml } from "@/features/email-templates/template-html.server";
import { getHarlyPublicOrigin } from "@/lib/public-origin";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/**
 * Variable values for one application, the manual twin of the workflow
 * runtime's loader. Interview-only values stay blank: a hand-generated
 * document has no interview in context.
 */
async function loadApplicationValues(input: {
  workspaceId: string;
  actorId: string;
  applicationId: string;
}): Promise<{ values: TemplateValues; candidateId: string } | null> {
  const [row] = await db
    .select({
      candidateId: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      jobTitle: jobs.title,
      stageName: jobStages.name,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(jobStages, eq(jobStages.id, applications.currentStageId))
    .where(
      and(
        eq(applications.workspaceId, input.workspaceId),
        eq(applications.id, input.applicationId),
        isNull(candidates.deletedAt),
        isNull(jobs.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  const [[workspace], [actor], [offer]] = await Promise.all([
    db.select({ name: organization.name }).from(organization).where(eq(organization.id, input.workspaceId)).limit(1),
    db.select({ name: authUsers.name }).from(authUsers).where(eq(authUsers.id, input.actorId)).limit(1),
    db
      .select({
        salaryAmount: offers.salaryAmount,
        currency: offers.currency,
        salaryPeriod: offers.salaryPeriod,
        expiresAt: offers.expiresAt,
        startDate: offers.startDate,
      })
      .from(offers)
      .where(and(eq(offers.workspaceId, input.workspaceId), eq(offers.applicationId, input.applicationId)))
      .orderBy(desc(offers.createdAt))
      .limit(1),
  ]);
  const origin = getHarlyPublicOrigin();
  return {
    candidateId: row.candidateId,
    values: {
      candidate_first_name: row.firstName,
      candidate_last_name: row.lastName,
      candidate_full_name: `${row.firstName} ${row.lastName}`.trim(),
      job_title: row.jobTitle,
      stage_name: row.stageName ?? "",
      company_name: workspace?.name ?? "Harly",
      sender_name: actor?.name ?? "",
      portal_link: `${origin}/portal/applications/${input.applicationId}`,
      offer_salary:
        offer && offer.salaryAmount !== null && offer.salaryAmount !== undefined
          ? `${offer.currency ?? ""} ${offer.salaryAmount}${offer.salaryPeriod ? ` / ${offer.salaryPeriod}` : ""}`.trim()
          : "",
      offer_expiry: offer?.expiresAt ? dateFormat.format(offer.expiresAt) : "",
      offer_start_date: offer?.startDate ? dateFormat.format(offer.startDate) : "",
    },
  };
}

export type RenderedTemplate =
  | {
      ok: true;
      title: string;
      /** Interpolated, sanitized body HTML (what the PDF is rendered from). */
      body: string;
      candidateId: string;
      templateName: string;
      /** Variables the template uses that have no value for this candidate. */
      blank: string[];
    }
  | { ok: false; error: string };

/** Fill one workspace template with one application's data. */
export async function renderTemplateForApplication(input: {
  workspaceId: string;
  actorId: string;
  templateId: string;
  applicationId: string;
}): Promise<RenderedTemplate> {
  const [template] = await db
    .select({
      name: workflowDocumentTemplates.name,
      title: workflowDocumentTemplates.title,
      body: workflowDocumentTemplates.body,
    })
    .from(workflowDocumentTemplates)
    .where(
      and(
        eq(workflowDocumentTemplates.workspaceId, input.workspaceId),
        eq(workflowDocumentTemplates.id, input.templateId),
        isNull(workflowDocumentTemplates.archivedAt),
      ),
    )
    .limit(1);
  if (!template) return { ok: false, error: "Document template not found." };
  const unknown = findUnknownVariables(`${template.title}\n${template.body}`);
  if (unknown.length > 0) {
    return { ok: false, error: `This template uses unknown variables: ${unknown.join(", ")}.` };
  }
  const loaded = await loadApplicationValues(input);
  if (!loaded) return { ok: false, error: "Candidate application not found." };

  const { values } = loaded;
  const escaped = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, escapeHtml(value ?? "")]),
  ) as TemplateValues;
  const used = `${template.title}\n${template.body}`;
  const blank = TEMPLATE_VARIABLES.filter(
    (variable) =>
      !values[variable.key] && new RegExp(`\\{\\{\\s*${variable.key}\\s*\\}\\}`, "i").test(used),
  ).map((variable) => variable.label);
  return {
    ok: true,
    title: interpolateTemplate(template.title, values).replace(/[\r\n]/g, " ").trim(),
    body: sanitizeTemplateHtml(interpolateTemplate(template.body, escaped)).trim(),
    candidateId: loaded.candidateId,
    templateName: template.name,
    blank,
  };
}
