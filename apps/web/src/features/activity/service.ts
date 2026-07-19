import "server-only";

import { and, desc, eq, lt, or } from "drizzle-orm";

import { ApiError, type Cursor } from "@harly/api";
import {
  activityEvents,
  applications,
  candidateNotes,
  candidates,
  db,
  jobs,
  user,
} from "@harly/db";

export const ACTIVITY_ENTITY_TYPES = [
  "candidate",
  "application",
  "job",
  "note",
] as const;

export type ActivityEntityType = (typeof ACTIVITY_ENTITY_TYPES)[number];

export type ActivityEventApi = {
  id: string;
  entityType: ActivityEntityType;
  entityId: string;
  type: string;
  actor: { id: string; name: string } | null;
  /** PII-safe subset only. Bodies, names, emails, URLs and previews excluded. */
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
};

const SAFE_METADATA_KEYS = new Set([
  "fromStageId",
  "toStageId",
  "stageId",
  "offerId",
  "interviewId",
  "taskId",
  "source",
  "status",
  "decision",
  "bulk",
]);

function redactMetadata(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!SAFE_METADATA_KEYS.has(key)) continue;
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean"
    ) {
      result[key] = item;
    }
  }
  return result;
}

export function serializeActivityEvent(row: {
  id: string;
  entityType: ActivityEntityType;
  entityId: string;
  type: string;
  actorId: string | null;
  actorName: string | null;
  metadata: unknown;
  createdAt: Date;
}): ActivityEventApi {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    type: row.type,
    actor:
      row.actorId && row.actorName
        ? { id: row.actorId, name: row.actorName }
        : null,
    metadata: redactMetadata(row.metadata),
    createdAt: row.createdAt.toISOString(),
  };
}

function cursorWhere(cursor: Cursor | null) {
  if (!cursor) return undefined;
  const createdAt = new Date(cursor.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw ApiError.badRequest("Invalid `cursor`.");
  }
  return or(
    lt(activityEvents.createdAt, createdAt),
    and(
      eq(activityEvents.createdAt, createdAt),
      lt(activityEvents.id, cursor.id),
    ),
  );
}

async function assertEntityInWorkspace(input: {
  workspaceId: string;
  entityType: ActivityEntityType;
  entityId: string;
}): Promise<void> {
  const table =
    input.entityType === "candidate"
      ? candidates
      : input.entityType === "application"
        ? applications
        : input.entityType === "job"
          ? jobs
          : candidateNotes;
  const [entity] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, input.entityId), eq(table.workspaceId, input.workspaceId)))
    .limit(1);
  if (!entity) throw ApiError.notFound("Activity entity not found.");
}

export async function listActivityEventsForApi(input: {
  workspaceId: string;
  entityType?: ActivityEntityType;
  entityId?: string;
  type?: string;
  cursor: Cursor | null;
  limit: number;
}) {
  if (input.entityId && !input.entityType) {
    throw ApiError.badRequest("`entityType` is required with `entityId`.");
  }
  if (input.entityType && input.entityId) {
    await assertEntityInWorkspace({
      workspaceId: input.workspaceId,
      entityType: input.entityType,
      entityId: input.entityId,
    });
  }

  return db
    .select({
      id: activityEvents.id,
      entityType: activityEvents.entityType,
      entityId: activityEvents.entityId,
      type: activityEvents.type,
      actorId: activityEvents.actorId,
      actorName: user.name,
      metadata: activityEvents.metadata,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .leftJoin(user, eq(user.id, activityEvents.actorId))
    .where(
      and(
        eq(activityEvents.workspaceId, input.workspaceId),
        input.entityType
          ? eq(activityEvents.entityType, input.entityType)
          : undefined,
        input.entityId ? eq(activityEvents.entityId, input.entityId) : undefined,
        input.type ? eq(activityEvents.type, input.type) : undefined,
        cursorWhere(input.cursor),
      ),
    )
    .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
    .limit(input.limit + 1);
}
