"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ilike, isNull } from "drizzle-orm";
import { z } from "zod";
import { getTranslations } from "@/i18n/server";

import { db, workflowDocumentTemplates } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { findUnknownVariables } from "@/features/email-templates/interpolate";
import { sanitizeTemplateHtml } from "@/features/email-templates/template-html.server";
import { logAuditEvent } from "@/lib/audit-log";

type ServerTranslator = Awaited<ReturnType<typeof getTranslations>>;

function buildTemplateSchema(t: ServerTranslator) {
  return z.object({
    name: z.string().trim().min(1, t("nameRequired")).max(120),
    title: z.string().trim().min(1, t("titleRequired")).max(255),
    body: z.string().trim().min(1, t("contentRequired")).max(50_000),
    format: z.enum(["plain_text", "rich_text"]).default("rich_text"),
  });
}

type ActionResult = { success: boolean; error?: string; id?: string };

function uniqueViolation(error: unknown) {
  return error instanceof Error && "code" in error && (error as { code?: string }).code === "23505";
}

function cleanContent(title: string, body: string) {
  const cleanTitle = title.replace(/[\r\n]/g, "").trim();
  const cleanBody = sanitizeTemplateHtml(body).trim();
  return { title: cleanTitle, body: cleanBody };
}

function validateVariables(title: string, body: string, t: ServerTranslator) {
  const unknown = findUnknownVariables(`${title}\n${body}`);
  return unknown.length > 0
    ? t("unknownVariables", { count: unknown.length, names: unknown.join(", ") })
    : null;
}

async function workspaceContext() {
  return requirePermission("templates:manage");
}

function revalidateDocumentTemplatePaths() {
  revalidatePath("/dashboard/document-templates");
  revalidatePath("/dashboard/documents");
  revalidatePath("/dashboard/automations");
}

export async function createWorkflowDocumentTemplate(input: {
  name: string;
  title: string;
  body: string;
  format?: string;
}): Promise<ActionResult> {
  const t = await getTranslations("server.documents.templates");
  const parsed = buildTemplateSchema(t).safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? t("invalidTemplate") };
  const cleaned = cleanContent(parsed.data.title, parsed.data.body);
  const variableError = validateVariables(cleaned.title, cleaned.body, t);
  if (variableError) return { success: false, error: variableError };

  let context;
  try {
    context = await workspaceContext();
    const [created] = await db
      .insert(workflowDocumentTemplates)
      .values({
        workspaceId: context.organization.id,
        name: parsed.data.name,
        title: cleaned.title,
        body: cleaned.body,
        format: parsed.data.format,
        createdById: context.user.id,
        updatedById: context.user.id,
      })
      .returning({ id: workflowDocumentTemplates.id });
    if (!created) return { success: false, error: t("couldNotCreate") };
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "workflow_document_template.created",
      resourceType: "workflow_document_template",
      resourceId: created.id,
      severity: "info",
      metadata: { name: parsed.data.name },
    });
    revalidateDocumentTemplatePaths();
    return { success: true, id: created.id };
  } catch (error) {
    return { success: false, error: uniqueViolation(error) ? t("nameTaken") : t("couldNotSave") };
  }
}

export async function updateWorkflowDocumentTemplate(input: {
  templateId: string;
  name: string;
  title: string;
  body: string;
  format?: string;
}): Promise<ActionResult> {
  const t = await getTranslations("server.documents.templates");
  const parsed = buildTemplateSchema(t).extend({ templateId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? t("invalidTemplate") };
  const cleaned = cleanContent(parsed.data.title, parsed.data.body);
  const variableError = validateVariables(cleaned.title, cleaned.body, t);
  if (variableError) return { success: false, error: variableError };

  try {
    const context = await workspaceContext();
    const [updated] = await db
      .update(workflowDocumentTemplates)
      .set({
        name: parsed.data.name,
        title: cleaned.title,
        body: cleaned.body,
        format: parsed.data.format,
        updatedById: context.user.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflowDocumentTemplates.workspaceId, context.organization.id),
          eq(workflowDocumentTemplates.id, parsed.data.templateId),
          isNull(workflowDocumentTemplates.archivedAt),
        ),
      )
      .returning({ id: workflowDocumentTemplates.id });
    if (!updated) return { success: false, error: t("notFound") };
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "workflow_document_template.updated",
      resourceType: "workflow_document_template",
      resourceId: updated.id,
      severity: "info",
      metadata: { name: parsed.data.name },
    });
    revalidateDocumentTemplatePaths();
    return { success: true, id: updated.id };
  } catch (error) {
    return { success: false, error: uniqueViolation(error) ? t("nameTaken") : t("couldNotUpdate") };
  }
}

/** Archive rather than delete: published workflows may still carry this id. */
export async function archiveWorkflowDocumentTemplate(input: { templateId: string }): Promise<ActionResult> {
  const t = await getTranslations("server.documents.templates");
  const parsed = z.object({ templateId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { success: false, error: t("invalidTemplate") };
  try {
    const context = await workspaceContext();
    const [archived] = await db
      .update(workflowDocumentTemplates)
      .set({ archivedAt: new Date(), updatedById: context.user.id, updatedAt: new Date() })
      .where(
        and(
          eq(workflowDocumentTemplates.workspaceId, context.organization.id),
          eq(workflowDocumentTemplates.id, parsed.data.templateId),
          isNull(workflowDocumentTemplates.archivedAt),
        ),
      )
      .returning({ id: workflowDocumentTemplates.id });
    if (!archived) return { success: false, error: t("notFound") };
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "workflow_document_template.archived",
      resourceType: "workflow_document_template",
      resourceId: archived.id,
      severity: "warning",
    });
    revalidateDocumentTemplatePaths();
    return { success: true, id: archived.id };
  } catch {
    return { success: false, error: t("couldNotArchive") };
  }
}

/** Copy a template under a free "(copy)" name so it can be reworked without touching the original. */
export async function duplicateWorkflowDocumentTemplate(input: { templateId: string }): Promise<ActionResult> {
  const t = await getTranslations("server.documents.templates");
  const parsed = z.object({ templateId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { success: false, error: t("invalidTemplate") };
  try {
    const context = await workspaceContext();
    const [source] = await db
      .select()
      .from(workflowDocumentTemplates)
      .where(and(eq(workflowDocumentTemplates.workspaceId, context.organization.id), eq(workflowDocumentTemplates.id, parsed.data.templateId)))
      .limit(1);
    if (!source) return { success: false, error: t("notFound") };
    const base = source.name.replace(/ \(copy( \d+)?\)$/, "").slice(0, 100);
    const taken = await db
      .select({ name: workflowDocumentTemplates.name })
      .from(workflowDocumentTemplates)
      .where(and(eq(workflowDocumentTemplates.workspaceId, context.organization.id), ilike(workflowDocumentTemplates.name, `${base.replace(/[%_\\]/g, "\\$&")} (copy%`)));
    const used = new Set(taken.map((row) => row.name.toLowerCase()));
    let name = `${base} (copy)`;
    for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${base} (copy ${n})`;
    const [created] = await db
      .insert(workflowDocumentTemplates)
      .values({
        workspaceId: context.organization.id,
        name,
        title: source.title,
        body: source.body,
        format: source.format,
        createdById: context.user.id,
        updatedById: context.user.id,
      })
      .returning({ id: workflowDocumentTemplates.id });
    if (!created) return { success: false, error: t("couldNotDuplicate") };
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "workflow_document_template.created",
      resourceType: "workflow_document_template",
      resourceId: created.id,
      severity: "info",
      metadata: { name, duplicatedFrom: source.id },
    });
    revalidateDocumentTemplatePaths();
    return { success: true, id: created.id };
  } catch (error) {
    return { success: false, error: uniqueViolation(error) ? t("copyNameTaken") : t("couldNotDuplicate") };
  }
}

/** Bring an archived template back into the picker for new workflows and manual generation. */
export async function restoreWorkflowDocumentTemplate(input: { templateId: string }): Promise<ActionResult> {
  const t = await getTranslations("server.documents.templates");
  const parsed = z.object({ templateId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { success: false, error: t("invalidTemplate") };
  try {
    const context = await workspaceContext();
    const [restored] = await db
      .update(workflowDocumentTemplates)
      .set({ archivedAt: null, updatedById: context.user.id, updatedAt: new Date() })
      .where(
        and(
          eq(workflowDocumentTemplates.workspaceId, context.organization.id),
          eq(workflowDocumentTemplates.id, parsed.data.templateId),
        ),
      )
      .returning({ id: workflowDocumentTemplates.id });
    if (!restored) return { success: false, error: t("notFound") };
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "workflow_document_template.restored",
      resourceType: "workflow_document_template",
      resourceId: restored.id,
      severity: "info",
    });
    revalidateDocumentTemplatePaths();
    return { success: true, id: restored.id };
  } catch (error) {
    return { success: false, error: uniqueViolation(error) ? t("activeNameTaken") : t("couldNotRestore") };
  }
}
