import { ApiError, decodeCursor, paginate, parseLimit } from "@harly/api";

import {
  listActivityEventsForApi,
  serializeActivityEvent,
  type ActivityEntityType,
} from "@/features/activity/service";
import { buildRouteHandler } from "@/server/api/contracts";
import { listActivityEventsContract } from "@/server/api/contracts/activity-events";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

export const GET = withApi(
  buildRouteHandler(listActivityEventsContract, async ({ query, auth }) => {
    const q = query as {
      limit?: number;
      cursor?: string;
      entityType?: ActivityEntityType;
      entityId?: string;
      type?: string;
    };
    if (q.entityId && !q.entityType) {
      throw ApiError.badRequest("`entityType` is required with `entityId`.");
    }
    const limit = q.limit ?? parseLimit(null);
    const rows = await listActivityEventsForApi({
      workspaceId: auth.workspaceId,
      entityType: q.entityType,
      entityId: q.entityId,
      type: q.type,
      cursor: decodeCursor(q.cursor ?? null),
      limit,
    });
    const { items, meta } = paginate(rows, limit, (event) => ({
      createdAt: event.createdAt.toISOString(),
      id: event.id,
    }));
    return apiOk(items.map(serializeActivityEvent), { pagination: meta });
  }),
);
