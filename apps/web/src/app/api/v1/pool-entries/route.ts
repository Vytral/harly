import { ApiError, decodeCursor, paginate, parseLimit } from "@harly/api";
import { NextResponse } from "next/server";

import {
  addPoolEntryForApi,
  listPoolEntriesForApi,
  serializePoolEntry,
} from "@/features/pool/service";
import { resolveWorkspaceActorUserId } from "@/server/api/actor";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  createPoolEntryContract,
  listPoolEntriesContract,
} from "@/server/api/contracts/pool-entries";
import { reserveIdempotencyKey } from "@/server/api/idempotency";
import { apiOk, withApi } from "@/server/api/respond";
import { poolEntryCreateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export const GET = withApi(
  buildRouteHandler(listPoolEntriesContract, async ({ query, auth }) => {
    const q = query as {
      limit?: number;
      cursor?: string;
      candidateId?: string;
      jobId?: string;
      source?: "applied" | "imported" | "sourced" | "referred";
    };
    const limit = q.limit ?? parseLimit(null);
    const rows = await listPoolEntriesForApi({
      workspaceId: auth.workspaceId,
      cursor: decodeCursor(q.cursor ?? null),
      limit,
      candidateId: q.candidateId,
      jobId: q.jobId,
      source: q.source,
    });
    const { items, meta } = paginate(rows, limit, (entry) => ({
      createdAt: entry.createdAt.toISOString(),
      id: entry.id,
    }));
    return apiOk(items.map(serializePoolEntry), { pagination: meta });
  }),
);

export const POST = withApi(
  buildRouteHandler(
    createPoolEntryContract,
    async ({ body, auth, request }) => {
      const values = poolEntryCreateSchema.parse(body);
      const reservation = await reserveIdempotencyKey(request, auth);
      if (reservation.kind === "replay") {
        return NextResponse.json(reservation.response.body, {
          status: reservation.response.status,
        });
      }

      const actorId = await resolveWorkspaceActorUserId(
        auth.workspaceId,
        auth.createdById,
      );
      if (!actorId) {
        throw ApiError.unprocessable(
          "Workspace has no owner to attribute this to.",
        );
      }
      const entry = await addPoolEntryForApi({
        workspaceId: auth.workspaceId,
        actorId,
        values,
      });
      const bodyJson = serializePoolEntry(entry);
      const response = apiOk(bodyJson, { status: 201 });
      if (reservation.kind === "reserved") {
        await reservation.complete({ status: response.status, body: bodyJson });
      }
      return response;
    },
  ),
);
