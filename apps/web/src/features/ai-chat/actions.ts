"use server";

import { and, eq } from "drizzle-orm";

import { db, aiConversations } from "@harly/db";

import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import {
  getConversationMessages,
  listConversations,
  type ConversationListItem,
  type StoredUIMessage,
} from "./data";

/** Re-fetch the conversation list (after delete / new chat / first message). */
export async function listConversationsAction(): Promise<ConversationListItem[]> {
  const context = await getWorkspaceContextOrNull();
  if (!context) return [];
  return listConversations();
}

/** Load one conversation's messages to seed the chat when switching threads. */
export async function loadConversationAction(
  conversationId: string,
): Promise<StoredUIMessage[] | null> {
  const context = await getWorkspaceContextOrNull();
  if (!context) return null;
  return getConversationMessages(conversationId);
}

/** Delete a conversation (and its messages, via cascade). Ownership-checked. */
export async function deleteConversationAction(
  conversationId: string,
): Promise<{ success: boolean; error?: string }> {
  const context = await getWorkspaceContextOrNull();
  if (!context) return { success: false, error: "Not signed in." };

  await db
    .delete(aiConversations)
    .where(
      and(
        eq(aiConversations.id, conversationId),
        eq(aiConversations.workspaceId, context.organization.id),
        eq(aiConversations.userId, context.user.id),
      ),
    );

  return { success: true };
}

/** Rename a conversation. Ownership-checked. */
export async function renameConversationAction(
  conversationId: string,
  title: string,
): Promise<{ success: boolean; error?: string }> {
  const context = await getWorkspaceContextOrNull();
  if (!context) return { success: false, error: "Not signed in." };

  const trimmed = title.trim().slice(0, 120);
  if (!trimmed) return { success: false, error: "Title is required." };

  await db
    .update(aiConversations)
    .set({ title: trimmed })
    .where(
      and(
        eq(aiConversations.id, conversationId),
        eq(aiConversations.workspaceId, context.organization.id),
        eq(aiConversations.userId, context.user.id),
      ),
    );

  return { success: true };
}
