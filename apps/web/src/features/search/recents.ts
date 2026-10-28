import type { SearchGroupKey } from "./results";

/**
 * Recently opened palette results, kept per browser and per workspace. This is
 * a per-viewer convenience, so every storage call is guarded: private windows,
 * blocked site data and throwing accessors all degrade to "no recents".
 */

export const RECENTS_LIMIT = 8;

const KEY_PREFIX = "harly.search.recents.v1:";
const MAX_TEXT_LENGTH = 300;
const GROUPS: readonly SearchGroupKey[] = [
  "jobs",
  "candidates",
  "applications",
  "tasks",
  "people",
];

export type RecentSearchItem = {
  group: SearchGroupKey;
  id: string;
  primary: string;
  secondary: string | null;
  href: string;
};

export type RecentsStorage = Pick<Storage, "getItem" | "setItem">;

export function recentsStorageKey(workspaceId: string): string {
  return `${KEY_PREFIX}${workspaceId}`;
}

/** The browser's localStorage, or null when the accessor itself throws. */
export function browserRecentsStorage(): RecentsStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function sameRecent(
  a: Pick<RecentSearchItem, "group" | "id">,
  b: Pick<RecentSearchItem, "group" | "id">,
): boolean {
  return a.group === b.group && a.id === b.id;
}

/** Only same-origin paths are accepted, so a stored value can never point off-site. */
function isSafeHref(href: unknown): href is string {
  return (
    typeof href === "string" &&
    href.startsWith("/") &&
    !href.startsWith("//") &&
    href.length <= 500
  );
}

function parseItem(value: unknown): RecentSearchItem | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;
  if (!GROUPS.includes(item.group as SearchGroupKey)) return null;
  if (typeof item.id !== "string" || item.id.length === 0 || item.id.length > 100) {
    return null;
  }
  if (typeof item.primary !== "string" || item.primary.length > MAX_TEXT_LENGTH) {
    return null;
  }
  if (
    item.secondary !== null &&
    (typeof item.secondary !== "string" || item.secondary.length > MAX_TEXT_LENGTH)
  ) {
    return null;
  }
  if (!isSafeHref(item.href)) return null;
  return {
    group: item.group as SearchGroupKey,
    id: item.id,
    primary: item.primary,
    secondary: item.secondary as string | null,
    href: item.href,
  };
}

/** Recents for a workspace, newest first. Corrupt or unreadable storage yields []. */
export function readRecents(
  storage: RecentsStorage | null,
  workspaceId: string,
): RecentSearchItem[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(recentsStorageKey(workspaceId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items: RecentSearchItem[] = [];
    for (const entry of parsed) {
      const item = parseItem(entry);
      if (item && !items.some((existing) => sameRecent(existing, item))) {
        items.push(item);
      }
      if (items.length === RECENTS_LIMIT) break;
    }
    return items;
  } catch {
    return [];
  }
}

function persist(
  storage: RecentsStorage | null,
  workspaceId: string,
  items: RecentSearchItem[],
): void {
  if (!storage) return;
  try {
    storage.setItem(recentsStorageKey(workspaceId), JSON.stringify(items));
  } catch {
    // Quota exceeded or storage blocked: the palette keeps the in-memory list.
  }
}

/**
 * Put an opened result at the top of the list, dropping any duplicate and
 * keeping at most {@link RECENTS_LIMIT}. Returns the list the UI should show.
 */
export function recordRecent(
  storage: RecentsStorage | null,
  workspaceId: string,
  item: RecentSearchItem,
): RecentSearchItem[] {
  const current = readRecents(storage, workspaceId);
  const next = [
    item,
    ...current.filter((existing) => !sameRecent(existing, item)),
  ].slice(0, RECENTS_LIMIT);
  persist(storage, workspaceId, next);
  return next;
}

export function removeRecent(
  storage: RecentsStorage | null,
  workspaceId: string,
  target: Pick<RecentSearchItem, "group" | "id">,
): RecentSearchItem[] {
  const next = readRecents(storage, workspaceId).filter(
    (existing) => !sameRecent(existing, target),
  );
  persist(storage, workspaceId, next);
  return next;
}
