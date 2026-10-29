import { describe, expect, it } from "vitest";

import {
  RECENTS_LIMIT,
  RECENTS_MAX_AGE_MS,
  clearAllSearchRecents,
  filterRecentsByPermission,
  pruneExpiredRecents,
  purgeLegacyRecents,
  readRecents,
  recentFromHit,
  recentsStorageKey,
  recordRecent,
  removeRecent,
  type ClearableStorage,
  type RecentSearchItem,
  type RecentsScope,
  type RecentsStorage,
} from "./recents";
import type { WorkspaceSearchHit } from "./results";

class MemoryStorage implements RecentsStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  raw(key: string) {
    return this.values.get(key);
  }
  keys() {
    return [...this.values.keys()];
  }
  get length() {
    return this.values.size;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
}

const throwingStorage: RecentsStorage = {
  getItem() {
    throw new Error("SecurityError: storage is disabled");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
  removeItem() {
    throw new Error("SecurityError: storage is disabled");
  },
};

const alice: RecentsScope = { userId: "user-alice", workspaceId: "ws-1" };
const bob: RecentsScope = { userId: "user-bob", workspaceId: "ws-1" };
const NOW = Date.UTC(2026, 9, 29, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

/** Storage whose removal fails for one named key, to prove the sweep keeps going. */
class StubbornStorage extends MemoryStorage {
  constructor(private readonly stuckKey: string) {
    super();
  }
  override removeItem(key: string) {
    if (key === this.stuckKey) throw new Error("QuotaExceededError");
    super.removeItem(key);
  }
}

function item(n: number, overrides: Partial<RecentSearchItem> = {}): RecentSearchItem {
  return {
    group: "jobs",
    id: `job-${n}`,
    primary: `Job ${n}`,
    href: `/dashboard/jobs/job-${n}`,
    ...overrides,
  };
}

describe("recents storage", () => {
  it("returns an empty list when storage is unavailable", () => {
    expect(readRecents(null, alice)).toEqual([]);
    expect(readRecents(throwingStorage, alice)).toEqual([]);
  });

  it("keeps the in-memory list when storage throws on write", () => {
    const next = recordRecent(throwingStorage, alice, item(1));
    expect(next).toEqual([item(1)]);
    expect(removeRecent(throwingStorage, alice, item(1))).toEqual([]);
  });

  it("does not throw when purging legacy storage fails", () => {
    expect(() => purgeLegacyRecents(throwingStorage, "ws-1")).not.toThrow();
  });

  it("puts the newest result first and removes duplicates", () => {
    const storage = new MemoryStorage();
    recordRecent(storage, alice, item(1));
    recordRecent(storage, alice, item(2));
    const next = recordRecent(storage, alice, item(1, { primary: "Renamed" }));

    expect(next.map((entry) => entry.id)).toEqual(["job-1", "job-2"]);
    expect(next[0].primary).toBe("Renamed");
    expect(readRecents(storage, alice)).toEqual(next);
  });

  it("keeps only the most recent entries", () => {
    const storage = new MemoryStorage();
    for (let n = 1; n <= RECENTS_LIMIT + 3; n += 1) {
      recordRecent(storage, alice, item(n));
    }
    const stored = readRecents(storage, alice);
    expect(stored).toHaveLength(RECENTS_LIMIT);
    expect(stored[0].id).toBe(`job-${RECENTS_LIMIT + 3}`);
  });

  it("isolates recents per workspace", () => {
    const storage = new MemoryStorage();
    recordRecent(storage, alice, item(1));
    expect(readRecents(storage, { ...alice, workspaceId: "ws-2" })).toEqual([]);
  });

  it("isolates recents per user on a shared browser", () => {
    const storage = new MemoryStorage();
    recordRecent(storage, alice, item(1, { primary: "Candidate Alice Saw" }));
    expect(readRecents(storage, bob)).toEqual([]);
    expect(recentsStorageKey(alice)).not.toBe(recentsStorageKey(bob));
    expect(recentsStorageKey(alice)).not.toBe(
      recentsStorageKey({ userId: alice.userId, workspaceId: "ws-2" }),
    );
  });

  it("stores only id, group, display name and href", () => {
    const storage = new MemoryStorage();
    recordRecent(storage, alice, {
      group: "applications",
      id: "app-1",
      primary: "Ada Lovelace",
      href: "/dashboard/candidates/cand-1",
    });
    const raw = storage.raw(recentsStorageKey(alice)) ?? "";
    const stored = JSON.parse(raw) as Record<string, unknown>[];
    expect(Object.keys(stored[0]).sort()).toEqual([
      "group",
      "href",
      "id",
      "primary",
      "visitedAt",
    ]);
    expect(raw).not.toMatch(/@|headline|stage|Engineering/i);
  });

  it("drops contact details and stage text from a hit when it becomes a recent", () => {
    const hit: WorkspaceSearchHit = {
      group: "candidates",
      id: "cand-1",
      primary: "Ada Lovelace",
      secondary: "ada@example.test",
      href: "/dashboard/candidates/cand-1",
      avatarUrl: null,
      highlight: [],
    };
    expect(recentFromHit(hit)).toEqual({
      group: "candidates",
      id: "cand-1",
      primary: "Ada Lovelace",
      href: "/dashboard/candidates/cand-1",
    });
  });

  it("ignores stored secondary text written by earlier versions", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      recentsStorageKey(alice),
      JSON.stringify([
        {
          group: "candidates",
          id: "cand-1",
          primary: "Ada",
          secondary: "ada@example.test",
          href: "/dashboard/candidates/cand-1",
          visitedAt: NOW,
        },
      ]),
    );
    const [entry] = readRecents(storage, alice, NOW);
    expect(entry).toBeDefined();
    expect(entry).not.toHaveProperty("secondary");
  });

  it("purges the workspace-only recents written before user keying", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "harly.search.recents.v1:ws-1",
      JSON.stringify([{ group: "candidates", id: "c", primary: "Ada", secondary: "ada@example.test", href: "/x" }]),
    );
    storage.setItem("harly.search.recents.v1:ws-2", "[]");
    purgeLegacyRecents(storage, "ws-1");
    expect(storage.keys()).toEqual(["harly.search.recents.v1:ws-2"]);
  });

  it("removes one entry and leaves the rest in order", () => {
    const storage = new MemoryStorage();
    recordRecent(storage, alice, item(1));
    recordRecent(storage, alice, item(2));
    recordRecent(storage, alice, item(3));
    const next = removeRecent(storage, alice, { group: "jobs", id: "job-2" });
    expect(next.map((entry) => entry.id)).toEqual(["job-3", "job-1"]);
  });

  it("ignores corrupt JSON and malformed entries without throwing", () => {
    const storage = new MemoryStorage();
    storage.setItem(recentsStorageKey(alice), "{not json");
    expect(readRecents(storage, alice)).toEqual([]);

    storage.setItem(
      recentsStorageKey(alice),
      JSON.stringify([
        "nope",
        null,
        { group: "unknown", id: "x", primary: "x", href: "/x" },
        { group: "jobs", id: 7, primary: "x", href: "/x" },
        { group: "jobs", id: "ok", primary: "Good", href: "/dashboard/jobs/ok", visitedAt: NOW },
      ]),
    );
    expect(readRecents(storage, alice, NOW).map((entry) => entry.id)).toEqual(["ok"]);
  });

  it("drops entries whose href would leave the origin", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      recentsStorageKey(alice),
      JSON.stringify([
        { group: "jobs", id: "a", primary: "A", href: "https://evil.example" },
        { group: "jobs", id: "b", primary: "B", href: "//evil.example" },
        { group: "jobs", id: "c", primary: "C", href: "javascript:alert(1)" },
        { group: "jobs", id: "d", primary: "D", href: "/dashboard/jobs/d", visitedAt: NOW },
      ]),
    );
    expect(readRecents(storage, alice, NOW).map((entry) => entry.id)).toEqual(["d"]);
  });

  it("treats a non-array payload as empty", () => {
    const storage = new MemoryStorage();
    storage.setItem(recentsStorageKey(alice), JSON.stringify({ items: [] }));
    expect(readRecents(storage, alice)).toEqual([]);
  });
});

describe("recents permission filter", () => {
  it("keeps only groups the viewer's permissions still allow", () => {
    const items: RecentSearchItem[] = [
      item(1, { group: "jobs" }),
      item(2, { group: "candidates", id: "c-1" }),
      item(3, { group: "tasks", id: "t-1" }),
    ];
    expect(
      filterRecentsByPermission(items, ["jobs:view", "tasks:read"]).map((entry) => entry.group),
    ).toEqual(["jobs", "tasks"]);
    expect(filterRecentsByPermission(items, [])).toEqual([]);
  });
});

describe("recents expiry", () => {
  it("drops recents not visited within the last 30 days on read", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      recentsStorageKey(alice),
      JSON.stringify([
        { group: "jobs", id: "old", primary: "Old", href: "/dashboard/jobs/old", visitedAt: NOW - 31 * DAY },
        { group: "jobs", id: "fresh", primary: "Fresh", href: "/dashboard/jobs/fresh", visitedAt: NOW - DAY },
      ]),
    );
    expect(readRecents(storage, alice, NOW).map((entry) => entry.id)).toEqual(["fresh"]);
  });

  it("uses a 30 day window: one millisecond inside is kept, the boundary is dropped", () => {
    expect(RECENTS_MAX_AGE_MS).toBe(30 * DAY);
    const storage = new MemoryStorage();
    storage.setItem(
      recentsStorageKey(alice),
      JSON.stringify([
        { group: "jobs", id: "inside", primary: "In", href: "/dashboard/jobs/inside", visitedAt: NOW - RECENTS_MAX_AGE_MS + 1 },
        { group: "jobs", id: "edge", primary: "Edge", href: "/dashboard/jobs/edge", visitedAt: NOW - RECENTS_MAX_AGE_MS },
      ]),
    );
    expect(readRecents(storage, alice, NOW).map((entry) => entry.id)).toEqual(["inside"]);
  });

  it("treats entries without a visit time as expired", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      recentsStorageKey(alice),
      JSON.stringify([
        { group: "jobs", id: "untimed", primary: "Untimed", href: "/dashboard/jobs/untimed" },
        { group: "jobs", id: "bad", primary: "Bad", href: "/dashboard/jobs/bad", visitedAt: "yesterday" },
      ]),
    );
    expect(readRecents(storage, alice, NOW)).toEqual([]);
  });

  it("stamps the visit time when a result is opened", () => {
    const storage = new MemoryStorage();
    recordRecent(storage, alice, item(1), NOW);
    const stored = JSON.parse(storage.raw(recentsStorageKey(alice)) ?? "[]") as Array<{ visitedAt: number }>;
    expect(stored[0].visitedAt).toBe(NOW);
    expect(readRecents(storage, alice, NOW + DAY)).toEqual([item(1)]);
  });

  it("re-opening a recent refreshes its visit time so it stays", () => {
    const storage = new MemoryStorage();
    recordRecent(storage, alice, item(1), NOW - 29 * DAY);
    recordRecent(storage, alice, item(1), NOW - DAY);
    expect(readRecents(storage, alice, NOW)).toEqual([item(1)]);
  });

  it("removes expired entries from storage, not only from the returned list", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      recentsStorageKey(alice),
      JSON.stringify([
        { group: "jobs", id: "old", primary: "Old", href: "/dashboard/jobs/old", visitedAt: NOW - 40 * DAY },
        { group: "jobs", id: "fresh", primary: "Fresh", href: "/dashboard/jobs/fresh", visitedAt: NOW },
      ]),
    );
    pruneExpiredRecents(storage, alice, NOW);
    const stored = JSON.parse(storage.raw(recentsStorageKey(alice)) ?? "[]") as Array<{ id: string }>;
    expect(stored.map((entry) => entry.id)).toEqual(["fresh"]);
  });

  it("does not create a key when there is nothing to prune", () => {
    const storage = new MemoryStorage();
    pruneExpiredRecents(storage, alice, NOW);
    expect(storage.keys()).toEqual([]);
    expect(() => pruneExpiredRecents(throwingStorage, alice, NOW)).not.toThrow();
    expect(() => pruneExpiredRecents(null, alice, NOW)).not.toThrow();
  });
});

describe("clearAllSearchRecents", () => {
  it("removes recents for every user and workspace, including legacy keys, and nothing else", () => {
    const storage = new MemoryStorage();
    recordRecent(storage, alice, item(1));
    recordRecent(storage, bob, item(2));
    recordRecent(storage, { userId: "user-alice", workspaceId: "ws-2" }, item(3));
    storage.setItem("harly.search.recents.v1:ws-1", "[]");
    storage.setItem("harly-legal-draft", "{}");
    storage.setItem("theme", "dark");

    clearAllSearchRecents(storage);

    expect(storage.keys().sort()).toEqual(["harly-legal-draft", "theme"]);
    expect(readRecents(storage, alice)).toEqual([]);
    expect(readRecents(storage, bob)).toEqual([]);
  });

  it("does nothing, and does not throw, when storage is unavailable or throws", () => {
    const throwingClearable: ClearableStorage = {
      get length(): number {
        throw new Error("SecurityError: storage is disabled");
      },
      key() {
        throw new Error("SecurityError: storage is disabled");
      },
      removeItem() {
        throw new Error("SecurityError: storage is disabled");
      },
    };
    expect(() => clearAllSearchRecents(null)).not.toThrow();
    expect(() => clearAllSearchRecents(throwingClearable)).not.toThrow();
  });

  it("keeps sweeping the other keys when one cannot be removed", () => {
    const storage = new StubbornStorage("harly.search.recents.v2:stuck");
    storage.setItem("harly.search.recents.v2:stuck", "[]");
    storage.setItem("harly.search.recents.v2:free", "[]");
    expect(() => clearAllSearchRecents(storage)).not.toThrow();
    expect(storage.keys()).toEqual(["harly.search.recents.v2:stuck"]);
  });
});
