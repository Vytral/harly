import { describe, expect, it } from "vitest";

import {
  RECENTS_LIMIT,
  filterRecentsByPermission,
  purgeLegacyRecents,
  readRecents,
  recentFromHit,
  recentsStorageKey,
  recordRecent,
  removeRecent,
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
    expect(Object.keys(stored[0]).sort()).toEqual(["group", "href", "id", "primary"]);
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
        },
      ]),
    );
    const [entry] = readRecents(storage, alice);
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
        { group: "jobs", id: "ok", primary: "Good", href: "/dashboard/jobs/ok" },
      ]),
    );
    expect(readRecents(storage, alice).map((entry) => entry.id)).toEqual(["ok"]);
  });

  it("drops entries whose href would leave the origin", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      recentsStorageKey(alice),
      JSON.stringify([
        { group: "jobs", id: "a", primary: "A", href: "https://evil.example" },
        { group: "jobs", id: "b", primary: "B", href: "//evil.example" },
        { group: "jobs", id: "c", primary: "C", href: "javascript:alert(1)" },
        { group: "jobs", id: "d", primary: "D", href: "/dashboard/jobs/d" },
      ]),
    );
    expect(readRecents(storage, alice).map((entry) => entry.id)).toEqual(["d"]);
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
