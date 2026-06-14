import { ApiError } from "./errors";
import type { PaginationMeta } from "./envelope";

/**
 * Opaque cursor pagination. The cursor encodes the sort key of the last row
 * (an ISO timestamp + id) as base64url, so callers treat it as opaque.
 */
export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

export type Cursor = { createdAt: string; id: string };

export function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    throw ApiError.badRequest("`limit` must be a positive integer.");
  }
  return Math.min(n, MAX_LIMIT);
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | null): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as Partial<Cursor>;
    if (typeof parsed.createdAt === "string" && typeof parsed.id === "string") {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
  } catch {
    // fall through
  }
  throw ApiError.badRequest("Invalid `cursor`.");
}

/**
 * Given the rows fetched with `limit + 1`, split off the extra row and build
 * the pagination meta. `keyOf` extracts the cursor from the last visible row.
 */
export function paginate<T>(
  rows: T[],
  limit: number,
  keyOf: (row: T) => Cursor,
): { items: T[]; meta: PaginationMeta } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    meta: {
      hasMore,
      limit,
      nextCursor: hasMore && last ? encodeCursor(keyOf(last)) : null,
    },
  };
}
