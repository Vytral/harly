import { describe, expect, it } from "vitest";

import {
  RECENTS_LIMIT,
  readRecents,
  recentsStorageKey,
  recordRecent,
  removeRecent,
  type RecentSearchItem,
  type RecentsStorage,
} from "./recents";

class MemoryStorage implements RecentsStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  raw(key: string) {
    return this.values.get(key);
  }
}

const throwingStorage: RecentsStorage = {
  getItem() {
    throw new Error("SecurityError: storage is disabled");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
};

function item(n: number, overrides: Partial<RecentSearchItem> = {}): RecentSearchItem {
  return {
    group: "jobs",
    id: `job-${n}`,
    primary: `Job ${n}`,
    secondary: "Engineering",
    href: `/dashboard/jobs/job-${n}`,
    ...overrides,
  };
}

describe("recents storage", () => {
  it("returns an empty list when storage is unavailable", () => {
    expect(readRecents(null, "ws-1")).toEqual([]);
    expect(readRecents(throwingStorage, "ws-1")).toEqual([]);
  });

  it("keeps the in-memory list when storage throws on write", () => {
    const next = recordRecent(throwingStorage, "ws-1", item(1));
    expect(next).toEqual([item(1)]);
    expect(removeRecent(throwingStorage, "ws-1", item(1))).toEqual([]);
  });

  it("puts the newest result first and removes duplicates", () => {
    const storage = new MemoryStorage();
    recordRecent(storage, "ws-1", item(1));
    recordRecent(storage, "ws-1", item(2));
    const next = recordRecent(storage, "ws-1", item(1, { primary: "Renamed" }));

    expect(next.map((entry) => entry.id)).toEqual(["job-1", "job-2"]);
    expect(next[0].primary).toBe("Renamed");
    expect(readRecents(storage, "ws-1")).toEqual(next);
  });

  it("keeps only the most recent entries", () => {
    const storage = new MemoryStorage();
    for (let n = 1; n <= RECENTS_LIMIT + 3; n += 1) {
      recordRecent(storage, "ws-1", item(n));
    }
    const stored = readRecents(storage, "ws-1");
    expect(stored).toHaveLength(RECENTS_LIMIT);
    expect(stored[0].id).toBe(`job-${RECENTS_LIMIT + 3}`);
  });

  it("isolates recents per workspace", () => {
    const storage = new MemoryStorage();
    recordRecent(storage, "ws-a", item(1));
    expect(readRecents(storage, "ws-b")).toEqual([]);
    expect(recentsStorageKey("ws-a")).not.toBe(recentsStorageKey("ws-b"));
  });

  it("removes one entry and leaves the rest in order", () => {
    const storage = new MemoryStorage();
    recordRecent(storage, "ws-1", item(1));
    recordRecent(storage, "ws-1", item(2));
    recordRecent(storage, "ws-1", item(3));
    const next = removeRecent(storage, "ws-1", { group: "jobs", id: "job-2" });
    expect(next.map((entry) => entry.id)).toEqual(["job-3", "job-1"]);
  });

  it("ignores corrupt JSON and malformed entries without throwing", () => {
    const storage = new MemoryStorage();
    storage.setItem(recentsStorageKey("ws-1"), "{not json");
    expect(readRecents(storage, "ws-1")).toEqual([]);

    storage.setItem(
      recentsStorageKey("ws-1"),
      JSON.stringify([
        "nope",
        null,
        { group: "unknown", id: "x", primary: "x", secondary: null, href: "/x" },
        { group: "jobs", id: 7, primary: "x", secondary: null, href: "/x" },
        { group: "jobs", id: "ok", primary: "Good", secondary: null, href: "/dashboard/jobs/ok" },
      ]),
    );
    expect(readRecents(storage, "ws-1").map((entry) => entry.id)).toEqual(["ok"]);
  });

  it("drops entries whose href would leave the origin", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      recentsStorageKey("ws-1"),
      JSON.stringify([
        { group: "jobs", id: "a", primary: "A", secondary: null, href: "https://evil.example" },
        { group: "jobs", id: "b", primary: "B", secondary: null, href: "//evil.example" },
        { group: "jobs", id: "c", primary: "C", secondary: null, href: "javascript:alert(1)" },
        { group: "jobs", id: "d", primary: "D", secondary: null, href: "/dashboard/jobs/d" },
      ]),
    );
    expect(readRecents(storage, "ws-1").map((entry) => entry.id)).toEqual(["d"]);
  });

  it("treats a non-array payload as empty", () => {
    const storage = new MemoryStorage();
    storage.setItem(recentsStorageKey("ws-1"), JSON.stringify({ items: [] }));
    expect(readRecents(storage, "ws-1")).toEqual([]);
  });
});
