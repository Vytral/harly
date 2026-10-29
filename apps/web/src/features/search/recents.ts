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

/**
 * A recent is dropped once it has not been opened for this long. Recents are a
 * convenience, not a history, so the browser should not keep an opened record
 * indefinitely.
 */
export const RECENTS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Every key this module writes starts with this prefix, current and legacy. */
export const RECENTS_KEY_PREFIX = "harly.search.recents.";
const KEY_PREFIX = `${RECENTS_KEY_PREFIX}v2:`;
/** Pre-user-keyed storage. It held contact details, so it is purged, never read. */
const LEGACY_KEY_PREFIX = `${RECENTS_KEY_PREFIX}v1:`;
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

/** Enough of a Storage to enumerate and remove keys, for sign-out. */
export type ClearableStorage = Pick<Storage, "key" | "length" | "removeItem">;

type StoredRecent = RecentSearchItem & { visitedAt: number };

export function recentsStorageKey(scope: RecentsScope): string {
  return `${KEY_PREFIX}${encodeURIComponent(scope.userId)}/${encodeURIComponent(scope.workspaceId)}`;
}

/** The browser's localStorage, or null when the accessor itself throws. */
export function browserLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function browserRecentsStorage(): RecentsStorage | null {
  return browserLocalStorage();
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

/** A visit is live while it is strictly newer than the window. Entries without a usable time are expired. */
function isLive(visitedAt: unknown, now: number): visitedAt is number {
  return (
    typeof visitedAt === "number" &&
    Number.isFinite(visitedAt) &&
    now - visitedAt >= 0 &&
    now - visitedAt < RECENTS_MAX_AGE_MS
  );
}

function parseItem(value: unknown, now: number): StoredRecent | null {
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
  if (!isLive(item.visitedAt, now)) return null;
  return {
    group: item.group as SearchGroupKey,
    id: item.id,
    primary: item.primary,
    href: item.href,
    visitedAt: item.visitedAt,
  };
}

/** Live recents with their visit times, newest first. Corrupt or unreadable storage yields []. */
function readStored(
  storage: RecentsStorage | null,
  scope: RecentsScope,
  now: number,
): StoredRecent[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(recentsStorageKey(scope));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items: StoredRecent[] = [];
    for (const entry of parsed) {
      const item = parseItem(entry, now);
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

/**
 * Recents for a user in a workspace, newest first. Recents not opened within
 * {@link RECENTS_MAX_AGE_MS} are dropped. Corrupt or unreadable storage yields [].
 */
export function readRecents(
  storage: RecentsStorage | null,
  scope: RecentsScope,
  now: number = Date.now(),
): RecentSearchItem[] {
  return readStored(storage, scope, now).map(storedRecent);
}

/**
 * Rewrites the viewer's stored recents without the expired ones, so they do not
 * linger in the browser. Writes nothing when the viewer has no recents key.
 */
export function pruneExpiredRecents(
  storage: RecentsStorage | null,
  scope: RecentsScope,
  now: number = Date.now(),
): void {
  if (!storage) return;
  try {
    if (storage.getItem(recentsStorageKey(scope)) === null) return;
    persist(storage, scope, readStored(storage, scope, now));
  } catch {
    // Storage blocked: nothing readable, so nothing to prune.
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

/**
 * Removes every stored recent, for every user and workspace on this browser.
 * Called on sign-out so the next person at this browser cannot see them. Each
 * removal is guarded on its own, so one failing key does not stop the sweep.
 */
export function clearAllSearchRecents(storage: ClearableStorage | null): void {
  if (!storage) return;
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null && key.startsWith(RECENTS_KEY_PREFIX)) keys.push(key);
    }
  } catch {
    // Storage blocked: nothing readable was stored.
    return;
  }
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {
      // This key could not be removed; the rest still should be.
    }
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
  items: StoredRecent[],
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
  now: number = Date.now(),
): RecentSearchItem[] {
  const current = readStored(storage, scope, now);
  const next: StoredRecent[] = [
    { ...storedRecent(item), visitedAt: now },
    ...current.filter((existing) => !sameRecent(existing, item)),
  ].slice(0, RECENTS_LIMIT);
  persist(storage, scope, next);
  return next.map(storedRecent);
}

export function removeRecent(
  storage: RecentsStorage | null,
  scope: RecentsScope,
  target: Pick<RecentSearchItem, "group" | "id">,
  now: number = Date.now(),
): RecentSearchItem[] {
  const next = readStored(storage, scope, now).filter(
    (existing) => !sameRecent(existing, target),
  );
  persist(storage, scope, next);
  return next.map(storedRecent);
}
