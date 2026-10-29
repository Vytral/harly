import {
  SEARCH_GROUP_PERMISSION,
  type SearchGroupKey,
  type WorkspaceSearchHit,
} from "./results";

/**
 * Recently opened palette results, kept per browser, per user and per
 * workspace. This is a per-viewer convenience: every storage call is guarded, so
 * private windows, blocked site data and throwing accessors all degrade to "no
 * recents".
 *
 * Only what is needed to reopen a result is stored: the group, the id, the
 * display name and the same-origin href. Contact details, headlines and stage
 * names are never written, so a recent cannot leak data the viewer has since
 * lost access to. The key includes the user, so a shared browser cannot show one
 * person's recents to the next.
 */

export const RECENTS_LIMIT = 8;

const KEY_PREFIX = "harly.search.recents.v2:";
/** Pre-user-keyed storage. It held contact details, so it is purged, never read. */
const LEGACY_KEY_PREFIX = "harly.search.recents.v1:";
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
  href: string;
};

export type RecentsScope = {
  userId: string;
  workspaceId: string;
};

export type RecentsStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function recentsStorageKey(scope: RecentsScope): string {
  return `${KEY_PREFIX}${encodeURIComponent(scope.userId)}/${encodeURIComponent(scope.workspaceId)}`;
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

/** The only shape that may be stored: copies the four stored fields and nothing else. */
function storedRecent(source: RecentSearchItem): RecentSearchItem {
  return {
    group: source.group,
    id: source.id,
    primary: source.primary,
    href: source.href,
  };
}

/** The recent to store for a palette hit, without contact details or stage text. */
export function recentFromHit(hit: WorkspaceSearchHit): RecentSearchItem {
  return storedRecent(hit);
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
  if (!isSafeHref(item.href)) return null;
  return {
    group: item.group as SearchGroupKey,
    id: item.id,
    primary: item.primary,
    href: item.href,
  };
}

/** Recents for a user in a workspace, newest first. Corrupt or unreadable storage yields []. */
export function readRecents(
  storage: RecentsStorage | null,
  scope: RecentsScope,
): RecentSearchItem[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(recentsStorageKey(scope));
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

/** Drop the pre-user-keyed recents for a workspace, which may hold contact details. */
export function purgeLegacyRecents(
  storage: RecentsStorage | null,
  workspaceId: string,
): void {
  if (!storage) return;
  try {
    storage.removeItem(`${LEGACY_KEY_PREFIX}${workspaceId}`);
  } catch {
    // Storage blocked: nothing was readable to begin with.
  }
}

/** Keep only recents whose group the viewer's permissions still allow. */
export function filterRecentsByPermission(
  items: readonly RecentSearchItem[],
  permissions: readonly string[],
): RecentSearchItem[] {
  return items.filter((item) =>
    permissions.includes(SEARCH_GROUP_PERMISSION[item.group]),
  );
}

function persist(
  storage: RecentsStorage | null,
  scope: RecentsScope,
  items: RecentSearchItem[],
): void {
  if (!storage) return;
  try {
    storage.setItem(recentsStorageKey(scope), JSON.stringify(items));
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
  scope: RecentsScope,
  item: RecentSearchItem,
): RecentSearchItem[] {
  const current = readRecents(storage, scope);
  const next = [
    storedRecent(item),
    ...current.filter((existing) => !sameRecent(existing, item)),
  ].slice(0, RECENTS_LIMIT);
  persist(storage, scope, next);
  return next;
}

export function removeRecent(
  storage: RecentsStorage | null,
  scope: RecentsScope,
  target: Pick<RecentSearchItem, "group" | "id">,
): RecentSearchItem[] {
  const next = readRecents(storage, scope).filter(
    (existing) => !sameRecent(existing, target),
  );
  persist(storage, scope, next);
  return next;
}
