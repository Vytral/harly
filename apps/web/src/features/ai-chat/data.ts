import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { db, aiConversations, aiMessages } from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";

export type ConversationListItem = {
  id: string;
  title: string | null;
  lastMessageAt: string;
};

/** A persisted message in the shape the AI SDK client expects to seed useChat. */
export type StoredUIMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  parts: unknown[];
};

/** List the current user's conversations in this workspace, newest first. */
export async function listConversations(): Promise<ConversationListItem[]> {
  const { organization: workspace, user } = await getWorkspaceContext();

  const rows = await db
    .select({
      id: aiConversations.id,
      title: aiConversations.title,
      lastMessageAt: aiConversations.lastMessageAt,
    })
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.workspaceId, workspace.id),
        eq(aiConversations.userId, user.id),
      ),
    )
    .orderBy(desc(aiConversations.lastMessageAt))
    .limit(50);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    lastMessageAt: r.lastMessageAt.toISOString(),
  }));
}

/**
 * Load one conversation's messages as UIMessages, ownership-checked. Returns
 * null when the conversation doesn't exist or isn't the caller's.
 */
export async function getConversationMessages(
  conversationId: string,
): Promise<StoredUIMessage[] | null> {
  const { organization: workspace, user } = await getWorkspaceContext();

  const [conversation] = await db
    .select({ id: aiConversations.id })
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.id, conversationId),
        eq(aiConversations.workspaceId, workspace.id),
        eq(aiConversations.userId, user.id),
      ),
    )
    .limit(1);

  if (!conversation) return null;

  const rows = await db
    .select({
      id: aiMessages.id,
      role: aiMessages.role,
      parts: aiMessages.parts,
    })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt));

  return rows.map((r) => ({
    id: r.id,
    role: r.role as StoredUIMessage["role"],
    parts: Array.isArray(r.parts) ? (r.parts as unknown[]) : [],
  }));
}

type PersistInput = {
  conversationId: string;
  workspaceId: string;
  userId: string;
  messages: Array<{ role: string; parts: unknown[] }>;
};

/** Derive a short conversation title from the first user message's text. */
function deriveTitle(messages: PersistInput["messages"]): string | null {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return null;
  const text = firstUser.parts
    .filter((p): p is { type: string; text: string } =>
      typeof p === "object" && p !== null && (p as { type?: string }).type === "text",
    )
    .map((p) => p.text)
    .join(" ")
    .trim();
  if (!text) return null;
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

/**
 * Persist the full message list for a conversation. Called from the chat route's
 * onFinish. Creates the conversation row if missing (ownership-stamped), then
 * replaces its messages with the current list and bumps lastMessageAt. Replacing
 * (vs appending) keeps the stored set exactly aligned with the client's state.
 */
export async function persistConversation(input: PersistInput): Promise<void> {
  const { conversationId, workspaceId, userId, messages } = input;
  if (messages.length === 0) return;

  const now = new Date();
  const title = deriveTitle(messages);

  await db.transaction(async (tx) => {
    // Upsert the conversation, scoped to its owner. onConflict guards against
    // races; the WHERE on delete/insert below all carry workspace+user.
    const [existing] = await tx
      .select({ id: aiConversations.id, title: aiConversations.title })
      .from(aiConversations)
      .where(
        and(
          eq(aiConversations.id, conversationId),
          eq(aiConversations.workspaceId, workspaceId),
          eq(aiConversations.userId, userId),
        ),
      )
      .limit(1);

    if (!existing) {
      await tx.insert(aiConversations).values({
        id: conversationId,
        workspaceId,
        userId,
        title,
        lastMessageAt: now,
      });
    } else {
      await tx
        .update(aiConversations)
        .set({ lastMessageAt: now, title: existing.title ?? title })
        .where(eq(aiConversations.id, conversationId));
    }

    // Replace the message set with the current list.
    await tx.delete(aiMessages).where(eq(aiMessages.conversationId, conversationId));
    if (messages.length > 0) {
      await tx.insert(aiMessages).values(
        messages.map((m) => ({
          workspaceId,
          conversationId,
          role: m.role,
          parts: m.parts,
        })),
      );
    }
  });
}
