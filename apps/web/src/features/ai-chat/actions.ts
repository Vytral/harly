"use server";

import { and, eq, isNull } from "drizzle-orm";

import { aiConversations, candidates, db } from "@harly/db";

import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { searchWorkspace } from "@/features/search/data";
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

/** Resolve the visible candidate label for the context chip without trusting client text. */
export async function getCandidateContextAction(candidateId: string): Promise<{
  id: string;
  name: string;
  email: string;
} | null> {
  const context = await getWorkspaceContextOrNull();
  if (!context) return null;

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
        eq(candidates.id, candidateId),
        eq(candidates.workspaceId, context.organization.id),
        isNull(candidates.deletedAt),
      ),
    )
    .limit(1);

  return candidate
    ? {
        id: candidate.id,
        name: `${candidate.firstName} ${candidate.lastName}`.trim(),
        email: candidate.email,
      }
    : null;
}

/** Search candidates for the @mention popover, always workspace-scoped. */
export async function searchCandidateMentionsAction(query: string) {
  const context = await getWorkspaceContextOrNull();
  if (!context) return [];
  const trimmed = query.trim().slice(0, 100);
  if (!trimmed) return [];
  const results = await searchWorkspace(trimmed);
  return results.candidates.slice(0, 6).map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    email: candidate.email,
    avatarUrl: candidate.avatarUrl,
  }));
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
