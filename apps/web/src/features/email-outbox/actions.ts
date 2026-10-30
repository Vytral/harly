"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { logAuditEvent } from "@/lib/audit-log";
import { OUTBOX_FILTERS } from "@/features/email-outbox/describe";
import {
  cancelDelivery,
  listDeliveryLog,
  retryDelivery,
  type DeliveryLogPage,
} from "@/features/email-outbox/service";

/**
 * Delivery log actions. They share the permission that gates Settings → Email
 * (`settings:edit`): recipients are candidate addresses, so only users who can
 * open that page see them.
 */

const listSchema = z.object({
  filter: z.enum(OUTBOX_FILTERS).default("all"),
  page: z.number().int().min(1).max(10_000).default(1),
});

const idSchema = z.object({ id: z.string().uuid() });

export async function listEmailDeliveryLogAction(
  input: z.input<typeof listSchema>,
): Promise<{ ok: true; data: DeliveryLogPage } | { ok: false; error: string }> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid filter." };
  await requirePermission("settings:edit");
  const { organization } = await getWorkspaceContext();
  const data = await listDeliveryLog({
    workspaceId: organization.id,
    filter: parsed.data.filter,
    page: parsed.data.page,
  });
  return { ok: true, data };
}

export async function retryEmailDeliveryAction(input: { id: string }) {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Unknown email." };
  await requirePermission("settings:edit");
  const { organization, user } = await getWorkspaceContext();
  const result = await retryDelivery({
    workspaceId: organization.id,
    id: parsed.data.id,
  });
  if (result.ok) {
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "email_outbox.retry",
      resourceType: "email_outbox",
      resourceId: parsed.data.id,
    });
    revalidatePath("/settings/email");
  }
  return result;
}

export async function cancelEmailDeliveryAction(input: { id: string }) {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Unknown email." };
  await requirePermission("settings:edit");
  const { organization, user } = await getWorkspaceContext();
  const result = await cancelDelivery({
    workspaceId: organization.id,
    id: parsed.data.id,
  });
  if (result.ok) {
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "email_outbox.cancel",
      resourceType: "email_outbox",
      resourceId: parsed.data.id,
    });
    revalidatePath("/settings/email");
  }
  return result;
}
