"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, max, sql } from "drizzle-orm";
import { z } from "zod";

import { db, rejectionReasons } from "@harly/db";

import { assertNotDemo } from "@/features/demo/assert-not-demo";
import {
  requireApplicationPermission,
  requirePermission,
} from "@/features/workspaces/permissions-server";
import { logAuditEvent } from "@/lib/audit-log";

import {
  buildRejectionEmailPreview,
  ensureRejectionReasons,
  listRejectionReasons,
  listRejectionTemplates,
} from "./data";
import {
  BUILT_IN_REJECTION_TEMPLATE,
  rejectionReasonCodeFromLabel,
  rejectionReasonLabelSchema,
  type RejectionEmailPreview,
  type RejectionReasonOption,
  type RejectionTemplateOption,
} from "./shared";

export type RejectDialogData = {
  reasons: RejectionReasonOption[];
  templates: RejectionTemplateOption[];
  /** Active rejection template id, else BUILT_IN_REJECTION_TEMPLATE. */
  defaultTemplateId: string;
};

/** Reasons and templates RejectDialog offers. Same gate as rejecting. */
export async function getRejectDialogDataAction(): Promise<
  { ok: true; data: RejectDialogData } | { ok: false; error: string }
> {
  try {
    const context = await requirePermission("candidates:edit");
    const workspaceId = context.organization.id;
    const [reasons, templates] = await Promise.all([
      listRejectionReasons(workspaceId),
      listRejectionTemplates(workspaceId),
    ]);
    return {
      ok: true,
      data: {
        reasons,
        templates,
        defaultTemplateId:
          templates.find((template) => template.isActive)?.id ??
          BUILT_IN_REJECTION_TEMPLATE,
      },
    };
  } catch {
    return { ok: false, error: "Could not load rejection options." };
  }
}

const previewSchema = z.object({
  applicationId: z.string().min(1),
  templateId: z.string().min(1),
});

/** Subject + body the candidate would receive, variables filled for them. */
export async function previewRejectionEmailAction(input: {
  applicationId: string;
  templateId: string;
}): Promise<
  { ok: true; preview: RejectionEmailPreview } | { ok: false; error: string }
> {
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid preview request." };
  try {
    const context = await requireApplicationPermission(
      "candidates:edit",
      parsed.data.applicationId,
    );
    const templateId =
      parsed.data.templateId === BUILT_IN_REJECTION_TEMPLATE
        ? null
        : parsed.data.templateId;
    const preview = await buildRejectionEmailPreview({
      workspaceId: context.organization.id,
      applicationId: parsed.data.applicationId,
      templateId,
    });
    if (!preview) return { ok: false, error: "Preview unavailable." };
    return { ok: true, preview };
  } catch {
    return { ok: false, error: "Preview unavailable." };
  }
}

// ── Settings: manage the catalog ────────────────────────────────────────────

export type RejectionReasonActionResult = { ok: boolean; error?: string };

async function labelTaken(
  workspaceId: string,
  label: string,
  exceptCode?: string,
): Promise<boolean> {
  const rows = await db
    .select({ code: rejectionReasons.code })
    .from(rejectionReasons)
    .where(
      and(
        eq(rejectionReasons.workspaceId, workspaceId),
        sql`lower(${rejectionReasons.label}) = lower(${label})`,
      ),
    );
  return rows.some((row) => row.code !== exceptCode);
}

export async function addRejectionReasonAction(
  label: string,
): Promise<RejectionReasonActionResult> {
  assertNotDemo();
  const context = await requirePermission("settings:edit");
  const parsed = rejectionReasonLabelSchema.safeParse(label);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid name." };
  }
  const workspaceId = context.organization.id;
  await ensureRejectionReasons(workspaceId);
  if (await labelTaken(workspaceId, parsed.data)) {
    return { ok: false, error: "A reason with that name already exists." };
  }

  const existingCodes = new Set(
    (
      await db
        .select({ code: rejectionReasons.code })
        .from(rejectionReasons)
        .where(eq(rejectionReasons.workspaceId, workspaceId))
    ).map((row) => row.code),
  );
  const base = rejectionReasonCodeFromLabel(parsed.data);
  let code = base;
  for (let suffix = 2; existingCodes.has(code); suffix += 1) {
    code = `${base}_${suffix}`;
  }
  const [{ last } = { last: null }] = await db
    .select({ last: max(rejectionReasons.position) })
    .from(rejectionReasons)
    .where(eq(rejectionReasons.workspaceId, workspaceId));

  await db.insert(rejectionReasons).values({
    workspaceId,
    code,
    label: parsed.data,
    position: (last ?? -1) + 1,
  });
  await logAuditEvent({
    workspaceId,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: "settings.rejection_reason_added",
    resourceType: "rejection_reason",
    resourceId: code,
    metadata: { label: parsed.data },
  });
  revalidatePath("/settings");
  return { ok: true };
}

const codeSchema = z.string().trim().min(1).max(64);

export async function renameRejectionReasonAction(
  code: string,
  label: string,
): Promise<RejectionReasonActionResult> {
  assertNotDemo();
  const context = await requirePermission("settings:edit");
  const parsedCode = codeSchema.safeParse(code);
  const parsedLabel = rejectionReasonLabelSchema.safeParse(label);
  if (!parsedCode.success) return { ok: false, error: "Unknown reason." };
  if (!parsedLabel.success) {
    return { ok: false, error: parsedLabel.error.issues[0]?.message ?? "Invalid name." };
  }
  const workspaceId = context.organization.id;
  if (await labelTaken(workspaceId, parsedLabel.data, parsedCode.data)) {
    return { ok: false, error: "A reason with that name already exists." };
  }
  const updated = await db
    .update(rejectionReasons)
    .set({ label: parsedLabel.data, updatedAt: new Date() })
    .where(
      and(
        eq(rejectionReasons.workspaceId, workspaceId),
        eq(rejectionReasons.code, parsedCode.data),
      ),
    )
    .returning({ id: rejectionReasons.id });
  if (updated.length === 0) return { ok: false, error: "Unknown reason." };
  await logAuditEvent({
    workspaceId,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: "settings.rejection_reason_renamed",
    resourceType: "rejection_reason",
    resourceId: parsedCode.data,
    metadata: { label: parsedLabel.data },
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function setRejectionReasonArchivedAction(
  code: string,
  archived: boolean,
): Promise<RejectionReasonActionResult> {
  assertNotDemo();
  const context = await requirePermission("settings:edit");
  const parsedCode = codeSchema.safeParse(code);
  if (!parsedCode.success) return { ok: false, error: "Unknown reason." };
  const workspaceId = context.organization.id;

  if (archived) {
    const active = await db
      .select({ code: rejectionReasons.code })
      .from(rejectionReasons)
      .where(
        and(
          eq(rejectionReasons.workspaceId, workspaceId),
          isNull(rejectionReasons.archivedAt),
        ),
      );
    if (active.length <= 1 && active[0]?.code === parsedCode.data) {
      return { ok: false, error: "Keep at least one active reason." };
    }
  }

  const updated = await db
    .update(rejectionReasons)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(
      and(
        eq(rejectionReasons.workspaceId, workspaceId),
        eq(rejectionReasons.code, parsedCode.data),
      ),
    )
    .returning({ id: rejectionReasons.id });
  if (updated.length === 0) return { ok: false, error: "Unknown reason." };
  await logAuditEvent({
    workspaceId,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: archived
      ? "settings.rejection_reason_archived"
      : "settings.rejection_reason_restored",
    resourceType: "rejection_reason",
    resourceId: parsedCode.data,
  });
  revalidatePath("/settings");
  return { ok: true };
}
