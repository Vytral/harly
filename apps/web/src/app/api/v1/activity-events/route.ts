import { ApiError, decodeCursor, paginate, parseLimit } from "@harly/api";
import { z } from "zod";

import {
  ACTIVITY_ENTITY_TYPES,
  listActivityEventsForApi,
  serializeActivityEvent,
  type ActivityEntityType,
} from "@/features/activity/service";
import { authenticateApiKey } from "@/server/api/auth";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

function optionalQueryValue(value: string | null, name: string, maxLength = 120) {
  if (value === null) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw ApiError.badRequest(`Invalid \`${name}\`.`);
  }
  return normalized;
}

/** GET /api/v1/activity-events , workspace audit timeline. */
export const GET = withApi(async (request) => {
  const ctx = await authenticateApiKey(request, "activity:read");
  const url = new URL(request.url);
  const entityTypeRaw = optionalQueryValue(
    url.searchParams.get("entityType"),
    "entityType",
    20,
  );
  if (
    entityTypeRaw &&
    !ACTIVITY_ENTITY_TYPES.includes(entityTypeRaw as ActivityEntityType)
  ) {
    throw ApiError.badRequest("Invalid `entityType`.");
  }
  const entityId = optionalQueryValue(url.searchParams.get("entityId"), "entityId");
  if (entityId && !z.uuid().safeParse(entityId).success) {
    throw ApiError.badRequest("Invalid `entityId`.");
  }

  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const rows = await listActivityEventsForApi({
    workspaceId: ctx.workspaceId,
    entityType: entityTypeRaw as ActivityEntityType | undefined,
    entityId,
    type: optionalQueryValue(url.searchParams.get("type"), "type"),
    cursor,
    limit,
  });
  const { items, meta } = paginate(rows, limit, (event) => ({
    createdAt: event.createdAt.toISOString(),
    id: event.id,
  }));
  return apiOk(items.map(serializeActivityEvent), { pagination: meta });
});
