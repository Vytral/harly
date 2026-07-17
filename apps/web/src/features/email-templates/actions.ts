"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { db, emailTemplates } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { logAuditEvent } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";

const log = createLogger("email-templates");

const TEMPLATE_TYPES = [
  "general",
  "interview_invite",
  "rejection",
  "offer",
  "screening",
  "stage_change",
] as const;

const templateFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  type: z.enum(TEMPLATE_TYPES).default("general"),
  subject: z.string().trim().min(1, "Subject is required.").max(300),
  body: z.string().trim().min(1, "Body is required.").max(10_000),
});

type ActionResult = { success: boolean; error?: string };

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}

function isTransactionConflict(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code: string }).code === "40001"
  );
}

export async function createEmailTemplate(input: {
  name: string;
  type?: string;
  subject: string;
  body: string;
}): Promise<ActionResult> {
  const parsed = templateFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid template.",
    };
  }

  let context;
  try {
    context = await requirePermission("templates:manage");
  } catch (error) {
    log.error(error, "template permission check failed");
    return {
      success: false,
      error: "You do not have permission to manage templates.",
    };
  }

  try {
    const [template] = await db
      .insert(emailTemplates)
      .values({
        workspaceId: context.organization.id,
        name: parsed.data.name,
        type: parsed.data.type,
        subject: parsed.data.subject,
        body: parsed.data.body,
        createdById: context.user.id,
      })
      .returning({ id: emailTemplates.id });
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "email_template.created",
      resourceType: "email_template",
      resourceId: template.id,
      severity: "info",
      metadata: { name: parsed.data.name, type: parsed.data.type },
    });
  } catch (error) {
    log.error(error, "template write failed");
    return {
      success: false,
      error: isUniqueViolation(error)
        ? "A template with that name already exists."
        : "Could not save the template. Please try again.",
    };
  }

  revalidatePath("/dashboard/templates");
  return { success: true };
}

export async function updateEmailTemplate(input: {
  templateId: string;
  name: string;
  type?: string;
  subject: string;
  body: string;
}): Promise<ActionResult> {
  const parsed = templateFieldsSchema
    .extend({ templateId: z.uuid() })
    .safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid template.",
    };
  }

  let context;
  try {
    context = await requirePermission("templates:manage");
  } catch (error) {
    log.error(error, "template permission check failed");
    return {
      success: false,
      error: "You do not have permission to manage templates.",
    };
  }

  try {
    const updated = await db.transaction(
      async (tx) => {
        const [template] = await tx
          .select({
            id: emailTemplates.id,
            type: emailTemplates.type,
            isActive: emailTemplates.isActive,
          })
          .from(emailTemplates)
          .where(
            and(
              eq(emailTemplates.workspaceId, context.organization.id),
              eq(emailTemplates.id, parsed.data.templateId),
            ),
          )
          .limit(1);

        if (!template) return false;

        // Changing the type of an active template would otherwise collide with
        // the active template in its new type. Clear that sibling first.
        if (template.isActive && template.type !== parsed.data.type) {
          await tx
            .update(emailTemplates)
            .set({ isActive: false })
            .where(
              and(
                eq(emailTemplates.workspaceId, context.organization.id),
                eq(emailTemplates.type, parsed.data.type),
                eq(emailTemplates.isActive, true),
              ),
            );
        }

        await tx
          .update(emailTemplates)
          .set({
            name: parsed.data.name,
            type: parsed.data.type,
            subject: parsed.data.subject,
            body: parsed.data.body,
          })
          .where(
            and(
              eq(emailTemplates.workspaceId, context.organization.id),
              eq(emailTemplates.id, parsed.data.templateId),
            ),
          );
        return true;
      },
      { isolationLevel: "serializable" },
    );

    if (!updated) return { success: false, error: "Template not found." };
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "email_template.updated",
      resourceType: "email_template",
      resourceId: parsed.data.templateId,
      severity: "info",
      metadata: { name: parsed.data.name, type: parsed.data.type },
    });
  } catch (error) {
    log.error(error, "template write failed");
    return {
      success: false,
      error: isUniqueViolation(error)
        ? "A template with that name already exists, or another active template was saved at the same time."
        : isTransactionConflict(error)
          ? "Another template was updated at the same time. Please try again."
          : "Could not update the template. Please try again.",
    };
  }

  revalidatePath("/dashboard/templates");
  return { success: true };
}

/**
 * Mark a template as the one used automatically for its `type`'s system
 * auto-email (reject / stage-change / offer / interview-scheduled), or unset
 * it back to the hardcoded default. Only one template per (workspace, type)
 * can be active — activating one deactivates any sibling of the same type.
 */
export async function setActiveEmailTemplate(input: {
  templateId: string;
  active: boolean;
}): Promise<ActionResult> {
  const parsed = z
    .object({ templateId: z.uuid(), active: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid template." };

  let context;
  try {
    context = await requirePermission("templates:manage");
  } catch (error) {
    log.error(error, "template permission check failed");
    return {
      success: false,
      error: "You do not have permission to manage templates.",
    };
  }

  const workspaceId = context.organization.id;

  let template: { id: string; type: (typeof TEMPLATE_TYPES)[number] } | null;
  try {
    template = await db.transaction(
      async (tx) => {
        const [current] = await tx
          .select({ id: emailTemplates.id, type: emailTemplates.type })
          .from(emailTemplates)
          .where(
            and(
              eq(emailTemplates.workspaceId, workspaceId),
              eq(emailTemplates.id, parsed.data.templateId),
            ),
          )
          .limit(1);

        if (!current) return null;

        if (parsed.data.active) {
          // Clear the previous active template before activating this one. The
          // partial unique index is the final guard against concurrent writes.
          await tx
            .update(emailTemplates)
            .set({ isActive: false })
            .where(
              and(
                eq(emailTemplates.workspaceId, workspaceId),
                eq(emailTemplates.type, current.type),
                eq(emailTemplates.isActive, true),
                ne(emailTemplates.id, current.id),
              ),
            );
        }

        await tx
          .update(emailTemplates)
          .set({ isActive: parsed.data.active })
          .where(
            and(
              eq(emailTemplates.workspaceId, workspaceId),
              eq(emailTemplates.id, current.id),
            ),
          );
        return current;
      },
      { isolationLevel: "serializable" },
    );
  } catch (error) {
    log.error(error, "template activation failed");
    return {
      success: false,
      error:
        isUniqueViolation(error) || isTransactionConflict(error)
          ? "Another template was activated at the same time. Please try again."
          : "Could not update the template. Please try again.",
    };
  }

  if (!template) return { success: false, error: "Template not found." };

  await logAuditEvent({
    workspaceId,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: parsed.data.active
      ? "email_template.activated"
      : "email_template.deactivated",
    resourceType: "email_template",
    resourceId: template.id,
    severity: "info",
    metadata: { type: template.type },
  });

  revalidatePath("/dashboard/templates");
  return { success: true };
}

export async function deleteEmailTemplate(input: {
  templateId: string;
}): Promise<ActionResult> {
  const parsed = z.object({ templateId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid template." };

  let context;
  try {
    context = await requirePermission("templates:manage");
  } catch (error) {
    log.error(error, "template permission check failed");
    return {
      success: false,
      error: "You do not have permission to manage templates.",
    };
  }

  await db
    .delete(emailTemplates)
    .where(
      and(
        eq(emailTemplates.workspaceId, context.organization.id),
        eq(emailTemplates.id, parsed.data.templateId),
      ),
    );
  await logAuditEvent({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: "email_template.deleted",
    resourceType: "email_template",
    resourceId: parsed.data.templateId,
    severity: "warning",
  });

  revalidatePath("/dashboard/templates");
  return { success: true };
}
