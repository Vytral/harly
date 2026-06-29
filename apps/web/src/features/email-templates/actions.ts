"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db, emailTemplates } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { createLogger } from "@/lib/logger";

const log = createLogger("email-templates");

const templateFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  subject: z.string().trim().min(1, "Subject is required.").max(300),
  body: z.string().trim().min(1, "Body is required.").max(10_000),
});

type ActionResult = { success: boolean; error?: string };

export async function createEmailTemplate(input: {
  name: string;
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
    return { success: false, error: "You do not have permission to manage templates." };
  }

  try {
    await db.insert(emailTemplates).values({
      workspaceId: context.organization.id,
      name: parsed.data.name,
      subject: parsed.data.subject,
      body: parsed.data.body,
      createdById: context.user.id,
    });
  } catch (error) {
    log.error(error, "template write failed");
    // PostgreSQL unique violation code: 23505
    const isUniqueViolation =
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "23505";
    return {
      success: false,
      error: isUniqueViolation
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
    return { success: false, error: "You do not have permission to manage templates." };
  }

  try {
    await db
      .update(emailTemplates)
      .set({
        name: parsed.data.name,
        subject: parsed.data.subject,
        body: parsed.data.body,
      })
      .where(
        and(
          eq(emailTemplates.workspaceId, context.organization.id),
          eq(emailTemplates.id, parsed.data.templateId),
        ),
      );
  } catch (error) {
    log.error(error, "template write failed");
    // PostgreSQL unique violation code: 23505
    const isUniqueViolation =
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "23505";
    return {
      success: false,
      error: isUniqueViolation
        ? "A template with that name already exists."
        : "Could not update the template. Please try again.",
    };
  }

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
    return { success: false, error: "You do not have permission to manage templates." };
  }

  await db
    .delete(emailTemplates)
    .where(
      and(
        eq(emailTemplates.workspaceId, context.organization.id),
        eq(emailTemplates.id, parsed.data.templateId),
      ),
    );

  revalidatePath("/dashboard/templates");
  return { success: true };
}
