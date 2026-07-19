import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { ApiError } from "@harly/api";
import {
  activityEvents,
  candidateNotes,
  candidateTags,
  candidates,
  db,
  member,
  notifications,
  user,
} from "@harly/db";

/**
 * API-only candidate collaboration service.
 *
 * Callers authenticate and authorize API keys before reaching this module. An
 * explicit actor is still required because notes/tags are attributable records
 * and their foreign keys must never be supplied by an untrusted request body.
 */

export type CandidateNoteMentionInput = { userId: string };

export type CandidateNoteApi = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string };
  mentions: { userId: string; name: string }[];
};

export type CandidateTagApi = {
  id: string;
  label: string;
  createdAt: string;
};

function serializeMentions(value: unknown): { userId: string; name: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((mention) => {
    if (
      !mention ||
      typeof mention !== "object" ||
      typeof (mention as { userId?: unknown }).userId !== "string" ||
      typeof (mention as { name?: unknown }).name !== "string"
    ) {
      return [];
    }
    return [{
      userId: (mention as { userId: string }).userId,
      name: (mention as { name: string }).name,
    }];
  });
}

function serializeNote(row: {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  authorName: string;
  mentions: unknown;
}): CandidateNoteApi {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: { id: row.authorId, name: row.authorName },
    mentions: serializeMentions(row.mentions),
  };
}

function serializeTag(row: {
  id: string;
  label: string;
  createdAt: Date;
}): CandidateTagApi {
  return {
    id: row.id,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
  };
}

async function requireCandidate(
  executor: Pick<typeof db, "select">,
  workspaceId: string,
  candidateId: string,
) {
  const [candidate] = await executor
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
    })
    .from(candidates)
    .where(
      and(
        eq(candidates.id, candidateId),
        eq(candidates.workspaceId, workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .limit(1);

  if (!candidate) throw ApiError.notFound("Candidate not found.");
  return candidate;
}

async function requireWorkspaceActor(
  executor: Pick<typeof db, "select">,
  workspaceId: string,
  actorId: string,
) {
  const [actor] = await executor
    .select({ id: user.id, name: user.name, email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, workspaceId),
        eq(member.userId, actorId),
      ),
    )
    .limit(1);

  if (!actor) throw ApiError.forbidden("Actor is not a member of this workspace.");
  return actor;
}

function normalizeNote(body: string): string {
  const value = body.trim();
  if (value.length === 0 || value.length > 5_000) {
    throw ApiError.unprocessable("Note body must be between 1 and 5000 characters.");
  }
  return value;
}

function normalizeTag(label: string): string {
  const value = label.trim();
  if (value.length === 0 || value.length > 40) {
    throw ApiError.unprocessable("Tag label must be between 1 and 40 characters.");
  }
  return value;
}

export async function listCandidateNotesForApi(input: {
  workspaceId: string;
  candidateId: string;
}): Promise<CandidateNoteApi[]> {
  await requireCandidate(db, input.workspaceId, input.candidateId);
  const rows = await db
    .select({
      id: candidateNotes.id,
      body: candidateNotes.body,
      createdAt: candidateNotes.createdAt,
      updatedAt: candidateNotes.updatedAt,
      authorId: user.id,
      authorName: user.name,
      mentions: candidateNotes.mentions,
    })
    .from(candidateNotes)
    .innerJoin(user, eq(user.id, candidateNotes.authorId))
    .where(
      and(
        eq(candidateNotes.workspaceId, input.workspaceId),
        eq(candidateNotes.candidateId, input.candidateId),
      ),
    )
    .orderBy(desc(candidateNotes.createdAt), desc(candidateNotes.id));

  return rows.map(serializeNote);
}

export async function createCandidateNoteForApi(input: {
  workspaceId: string;
  candidateId: string;
  actorId: string;
  body: string;
  mentions?: CandidateNoteMentionInput[];
}): Promise<CandidateNoteApi> {
  const body = normalizeNote(input.body);
  const requestedIds = [...new Set((input.mentions ?? []).map((mention) => mention.userId))];
  if (requestedIds.length > 20 || requestedIds.some((id) => id.trim().length === 0)) {
    throw ApiError.unprocessable("A note can mention up to 20 workspace members.");
  }

  return db.transaction(async (tx) => {
    const [candidate, actor] = await Promise.all([
      requireCandidate(tx, input.workspaceId, input.candidateId),
      requireWorkspaceActor(tx, input.workspaceId, input.actorId),
    ]);
    const mentionRows =
      requestedIds.length === 0
        ? []
        : await tx
            .select({ userId: user.id, name: user.name })
            .from(member)
            .innerJoin(user, eq(user.id, member.userId))
            .where(
              and(
                eq(member.organizationId, input.workspaceId),
                inArray(member.userId, requestedIds),
              ),
            );
    const mentions = mentionRows.map((row) => ({ userId: row.userId, name: row.name }));

    const [note] = await tx
      .insert(candidateNotes)
      .values({
        workspaceId: input.workspaceId,
        candidateId: input.candidateId,
        authorId: actor.id,
        body,
        mentions,
      })
      .returning({
        id: candidateNotes.id,
        body: candidateNotes.body,
        createdAt: candidateNotes.createdAt,
        updatedAt: candidateNotes.updatedAt,
        mentions: candidateNotes.mentions,
      });
    if (!note) throw ApiError.unprocessable("Note could not be created.");

    await tx.insert(activityEvents).values({
      workspaceId: input.workspaceId,
      actorId: actor.id,
      entityType: "candidate",
      entityId: input.candidateId,
      type: "note.added",
      metadata: { preview: body.slice(0, 100) },
    });

    const recipients = mentions.filter((mention) => mention.userId !== actor.id);
    if (recipients.length > 0) {
      await tx.insert(activityEvents).values(
        recipients.map((mention) => ({
          workspaceId: input.workspaceId,
          actorId: actor.id,
          entityType: "candidate" as const,
          entityId: input.candidateId,
          type: "note.mentioned",
          metadata: {
            noteId: note.id,
            mentionedUserId: mention.userId,
            mentionedName: mention.name,
            preview: body.slice(0, 100),
          },
        })),
      );
      await tx.insert(notifications).values(
        recipients.map((mention) => ({
          workspaceId: input.workspaceId,
          userId: mention.userId,
          actorId: actor.id,
          type: "note.mentioned",
          title: `${actor.name} mentioned you on ${candidate.firstName} ${candidate.lastName}`,
          body: body.slice(0, 200),
          href: `/dashboard/candidates/${input.candidateId}`,
          metadata: { noteId: note.id },
        })),
      );
    }

    return serializeNote({
      ...note,
      authorId: actor.id,
      authorName: actor.name,
    });
  });
}

export async function listCandidateTagsForApi(input: {
  workspaceId: string;
  candidateId: string;
}): Promise<CandidateTagApi[]> {
  await requireCandidate(db, input.workspaceId, input.candidateId);
  const rows = await db
    .select({
      id: candidateTags.id,
      label: candidateTags.label,
      createdAt: candidateTags.createdAt,
    })
    .from(candidateTags)
    .where(
      and(
        eq(candidateTags.workspaceId, input.workspaceId),
        eq(candidateTags.candidateId, input.candidateId),
      ),
    )
    .orderBy(asc(candidateTags.label), asc(candidateTags.id));
  return rows.map(serializeTag);
}

export async function createCandidateTagForApi(input: {
  workspaceId: string;
  candidateId: string;
  actorId: string;
  label: string;
}): Promise<{ tag: CandidateTagApi; created: boolean }> {
  const label = normalizeTag(input.label);

  return db.transaction(async (tx) => {
    await Promise.all([
      requireCandidate(tx, input.workspaceId, input.candidateId),
      requireWorkspaceActor(tx, input.workspaceId, input.actorId),
    ]);
    const [created] = await tx
      .insert(candidateTags)
      .values({
        workspaceId: input.workspaceId,
        candidateId: input.candidateId,
        label,
        createdById: input.actorId,
      })
      .onConflictDoNothing()
      .returning({
        id: candidateTags.id,
        label: candidateTags.label,
        createdAt: candidateTags.createdAt,
      });
    if (created) return { tag: serializeTag(created), created: true };

    const [existing] = await tx
      .select({
        id: candidateTags.id,
        label: candidateTags.label,
        createdAt: candidateTags.createdAt,
      })
      .from(candidateTags)
      .where(
        and(
          eq(candidateTags.workspaceId, input.workspaceId),
          eq(candidateTags.candidateId, input.candidateId),
          sql`lower(${candidateTags.label}) = lower(${label})`,
        ),
      )
      .limit(1);
    if (!existing) throw ApiError.conflict("Tag already exists.");
    return { tag: serializeTag(existing), created: false };
  });
}

export async function deleteCandidateTagForApi(input: {
  workspaceId: string;
  candidateId: string;
  tagId: string;
  actorId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await Promise.all([
      requireCandidate(tx, input.workspaceId, input.candidateId),
      requireWorkspaceActor(tx, input.workspaceId, input.actorId),
    ]);
    const [deleted] = await tx
      .delete(candidateTags)
      .where(
        and(
          eq(candidateTags.id, input.tagId),
          eq(candidateTags.workspaceId, input.workspaceId),
          eq(candidateTags.candidateId, input.candidateId),
        ),
      )
      .returning({ id: candidateTags.id });
    if (!deleted) throw ApiError.notFound("Tag not found.");
  });
}
