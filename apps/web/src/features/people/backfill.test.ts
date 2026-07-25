import { describe, expect, it } from "vitest";

import { resolveUsernameAssignments } from "@harly/db";

describe("resolveUsernameAssignments", () => {
  it("assigns a normalized username per candidate", () => {
    const { updated } = resolveUsernameAssignments(
      [{ id: "1", name: "Ada Lovelace" }],
      new Set(),
    );
    expect(updated).toEqual([
      { id: "1", username: "ada-lovelace", hadConflict: false },
    ]);
  });

  it("handles empty names", () => {
    const { updated } = resolveUsernameAssignments(
      [{ id: "1", name: "" }],
      new Set(),
    );
    expect(updated[0].username).toBe("member");
  });

  it("handles emoji/symbol-only names", () => {
    const { updated } = resolveUsernameAssignments(
      [{ id: "1", name: "🎉🔥" }],
      new Set(),
    );
    expect(updated[0].username).toBe("member");
  });

  it("strips accents and non-ASCII", () => {
    const { updated } = resolveUsernameAssignments(
      [{ id: "1", name: "José Ñáñez" }],
      new Set(),
    );
    expect(updated[0].username).toBe("jose-nanez");
  });

  it("resolves mass duplicates with numeric suffixes", () => {
    const candidates = Array.from({ length: 5 }, (_, i) => ({
      id: `u${i}`,
      name: "Ada Lovelace",
    }));
    const { updated } = resolveUsernameAssignments(candidates, new Set());
    const usernames = updated.map((u) => u.username);
    expect(new Set(usernames).size).toBe(5);
    expect(usernames).toContain("ada-lovelace");
    expect(
      usernames
        .filter((u) => u !== "ada-lovelace")
        .every((u) => /^ada-lovelace-\d+$/.test(u)),
    ).toBe(true);
  });

  it("resolves collisions against a pre-existing taken set", () => {
    const { updated } = resolveUsernameAssignments(
      [{ id: "1", name: "Ada Lovelace" }],
      new Set(["ada-lovelace"]),
    );
    expect(updated[0].username).not.toBe("ada-lovelace");
    expect(updated[0].hadConflict).toBe(true);
  });

  it("truncates long base names before appending a suffix, staying under 30 chars", () => {
    const longName = "Alexandria Bartholomew Constantinopoulos";
    const taken = new Set([
      resolveUsernameAssignments([{ id: "seed", name: longName }], new Set())
        .updated[0].username,
    ]);
    const { updated } = resolveUsernameAssignments(
      [{ id: "1", name: longName }],
      taken,
    );
    expect(updated[0].username.length).toBeLessThanOrEqual(30);
  });

  it("re-runs idempotently: usernames already taken are never reassigned to a new candidate", () => {
    const taken = new Set<string>();
    const first = resolveUsernameAssignments(
      [{ id: "1", name: "Grace Hopper" }],
      taken,
    );
    expect(first.updated[0].hadConflict).toBe(false);

    // Second pass with no new candidates (already-usernamed users are filtered
    // out upstream by the caller) is a no-op — nothing new to assign.
    const second = resolveUsernameAssignments([], taken);
    expect(second.updated).toEqual([]);
  });

  it("avoids reserved words by adding a suffix", () => {
    const { updated } = resolveUsernameAssignments(
      [{ id: "1", name: "Admin" }],
      new Set(),
    );
    expect(updated[0].username).not.toBe("admin");
    expect(updated[0].hadConflict).toBe(true);
  });
});
