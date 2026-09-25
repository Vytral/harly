import "server-only";

import { and, asc, desc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";

import { db, aiConversationCandidates, aiConversations, aiMessages, candidates } from "@harly/db";

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

const AI_CHAT_RETENTION_DAYS = 90;
const REDACTION_VERSION = 1;
const SENSITIVE_KEY = /(secret|token|cipher|authorization|api[_-]?key|password|cookie|set-cookie)/i;

/** Redacts credentials from tool calls/results while preserving UI structure. */
export function sanitizePersistedParts(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[REDACTED_DEPTH]";
  if (Array.isArray(value)) {
    return value.slice(0, 500).map((item) => sanitizePersistedParts(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = SENSITIVE_KEY.test(key)
        ? "[REDACTED]"
        : sanitizePersistedParts(child, depth + 1);
    }
    return result;
  }
  return value;
}

function retentionUntil(now: Date): Date {
  return new Date(now.getTime() + AI_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

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
        gt(aiConversations.retentionUntil, new Date()),
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
        gt(aiConversations.retentionUntil, new Date()),
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
    .where(
      and(
        eq(aiMessages.conversationId, conversationId),
        eq(aiMessages.workspaceId, workspace.id),
      ),
    )
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
  /** Optional linkage so a candidate erasure can cascade-delete the chat (IA-02). */
  candidateId?: string;
  /**
   * Every other candidate referenced in this turn (via @mention or a tool
   * result), so their PII embedded in `parts` is also reachable for erasure
   * (AI15). Accumulated across turns, never reduced: a candidate mentioned
   * in an earlier turn may still have PII in that turn's stored parts even
   * if a later turn no longer references them.
   */
  mentionedCandidateIds?: string[];
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_STRUCTURED_CANDIDATE_LINKS = 32;
const MAX_STRUCTURED_SCAN_NODES = 1_000;

/**
 * Extract candidate references from structured tool output without treating
 * assistant prose as authorization. The resulting values are still checked
 * against the workspace's live candidates below, so a forged or foreign UUID
 * cannot create a privacy link.
 */
function extractCandidateIdsFromMessages(
  messages: PersistInput["messages"],
): string[] {
  const ids = new Set<string>();
  let scannedNodes = 0;

  const add = (value: unknown) => {
    if (
      ids.size >= MAX_STRUCTURED_CANDIDATE_LINKS ||
      typeof value !== "string" ||
      !UUID_PATTERN.test(value)
    ) {
      return;
    }
    ids.add(value);
  };

  const visit = (value: unknown, depth: number): void => {
    if (
      depth > 8 ||
      scannedNodes >= MAX_STRUCTURED_SCAN_NODES ||
      ids.size >= MAX_STRUCTURED_CANDIDATE_LINKS ||
      value === null ||
      typeof value !== "object"
    ) {
      return;
    }
    scannedNodes += 1;

    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === "candidateId") add(child);
      if (key === "candidateIds" && Array.isArray(child)) {
        for (const id of child) add(id);
      }
      if (key === "candidate" && child && typeof child === "object") {
        add((child as { id?: unknown }).id);
        add((child as { candidateId?: unknown }).candidateId);
      }
      if (key === "candidates" && Array.isArray(child)) {
        for (const candidate of child) {
          if (candidate && typeof candidate === "object") {
            add((candidate as { id?: unknown }).id);
            add((candidate as { candidateId?: unknown }).candidateId);
          }
        }
      }
      visit(child, depth + 1);
    }
  };

  for (const message of messages) visit(message.parts, 0);
  return [...ids];
}

/**
 * Persist the full message list for a conversation. Called from the chat route's
 * onFinish. Creates the conversation row if missing (ownership-stamped), then
 * replaces its messages with the current list and bumps lastMessageAt. Replacing
 * (vs appending) keeps the stored set exactly aligned with the client's state.
 *
 * Every candidate referenced this turn (the active `candidateId`, explicit
 * `mentionedCandidateIds`, or a structured candidate reference returned by a
 * tool) is linked via `aiConversationCandidates` so a later erasure of ANY of
 * them removes this conversation, not only the one whose id happens to match
 * `aiConversations.candidateId` (AI15).
 */
export async function persistConversation(input: PersistInput): Promise<void> {
  const { conversationId, workspaceId, userId, candidateId, mentionedCandidateIds, messages } = input;
  if (messages.length === 0) return;

  const now = new Date();
  const title = deriveTitle(messages);

  // The client controls these ids. Only link candidates that actually belong
  // to this conversation's workspace and haven't been erased already.
  const referencedIds = [
    ...new Set(
      [
        candidateId,
        ...(mentionedCandidateIds ?? []),
        ...extractCandidateIdsFromMessages(messages),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const verifiedCandidates = referencedIds.length
    ? await db
        .select({ id: candidates.id })
        .from(candidates)
        .where(
          and(
            inArray(candidates.id, referencedIds),
            eq(candidates.workspaceId, workspaceId),
            isNull(candidates.deletedAt),
          ),
        )
    : [];
  const verifiedCandidateIds = verifiedCandidates.map((c) => c.id);
  const verifiedActiveCandidateId = candidateId && verifiedCandidateIds.includes(candidateId)
    ? candidateId
    : undefined;

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
        candidateId: verifiedActiveCandidateId ?? null,
        title,
        lastMessageAt: now,
        retentionUntil: retentionUntil(now),
      });
    } else {
      await tx
        .update(aiConversations)
        .set({
          lastMessageAt: now,
          retentionUntil: retentionUntil(now),
          title: existing.title ?? title,
        })
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
          parts: sanitizePersistedParts(m.parts),
          redactionVersion: REDACTION_VERSION,
        })),
      );
    }

    // Link every candidate referenced this turn. Additive only (never
    // deleted here): a candidate referenced in an earlier turn may still have
    // PII embedded in that turn's persisted parts even if this turn doesn't
    // mention them again, so the erasure linkage must accumulate.
    if (verifiedCandidateIds.length > 0) {
      await tx
        .insert(aiConversationCandidates)
        .values(
          verifiedCandidateIds.map((id) => ({
            conversationId,
            candidateId: id,
          })),
        )
        .onConflictDoNothing();
    }
  });
}

/**
 * Delete a candidate's linked AI conversations (and their messages, via the FK
 * cascade). Called during candidate erasure (IA-02 / GDPR Art. 17) so chat
 * history embedding the candidate's PII is removed with the candidate.
 *
 * Reaches conversations linked either as the "active" candidate
 * (`aiConversations.candidateId`) or as any other candidate referenced in the
 * conversation (`aiConversationCandidates`, AI15) — e.g. someone pulled in via
 * @mention or surfaced by a tool result, whose PII may still be embedded in
 * that conversation's stored message parts.
 */
export async function deleteConversationsForCandidate(
  candidateId: string,
  workspaceId: string,
): Promise<void> {
  const linkedViaMention = await db
    .select({ conversationId: aiConversationCandidates.conversationId })
    .from(aiConversationCandidates)
    .innerJoin(
      aiConversations,
      eq(aiConversations.id, aiConversationCandidates.conversationId),
    )
    .where(
      and(
        eq(aiConversationCandidates.candidateId, candidateId),
        eq(aiConversations.workspaceId, workspaceId),
      ),
    );
  const conversationIds = [
    ...new Set(linkedViaMention.map((row) => row.conversationId)),
  ];

  await db
    .delete(aiConversations)
    .where(
      and(
        eq(aiConversations.workspaceId, workspaceId),
        conversationIds.length > 0
          ? or(
              eq(aiConversations.candidateId, candidateId),
              inArray(aiConversations.id, conversationIds),
            )
          : eq(aiConversations.candidateId, candidateId),
      ),
    );
}

/** Scheduled retention reaper; message and candidate-link rows cascade. */
export async function purgeExpiredAiConversations(limit = 500): Promise<number> {
  const expired = await db
    .select({ id: aiConversations.id })
    .from(aiConversations)
    .where(lt(aiConversations.retentionUntil, new Date()))
    .limit(Math.max(1, Math.min(2_000, Math.floor(limit))));
  if (expired.length === 0) return 0;
  await db.delete(aiConversations).where(
    inArray(aiConversations.id, expired.map((row) => row.id)),
  );
  return expired.length;
}
