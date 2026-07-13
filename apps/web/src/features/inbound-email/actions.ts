"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db, mailMessages } from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";

const idSchema = z.object({ messageId: z.uuid() });

function revalidateReplies() {
  revalidatePath("/dashboard/replies");
  revalidatePath("/dashboard/inbox");
  revalidatePath("/dashboard", "layout");
}

/** Mark one inbound candidate reply as read in the active workspace. */
export async function markInboundReplyRead(input: {
  messageId: string;
}): Promise<{ success: boolean }> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { success: false };

  await requirePermission("collab:write");
  const { organization: workspace } = await getWorkspaceContext();
  await db
    .update(mailMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(mailMessages.id, parsed.data.messageId),
        eq(mailMessages.workspaceId, workspace.id),
        eq(mailMessages.direction, "inbound"),
      ),
    );

  revalidateReplies();
  return { success: true };
}

/** Clear the unread state for every received reply in the active workspace. */
export async function markAllInboundRepliesRead(): Promise<{
  success: boolean;
}> {
  await requirePermission("collab:write");
  const { organization: workspace } = await getWorkspaceContext();
  await db
    .update(mailMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(mailMessages.workspaceId, workspace.id),
        eq(mailMessages.direction, "inbound"),
        isNull(mailMessages.readAt),
      ),
    );

  revalidateReplies();
  return { success: true };
}
