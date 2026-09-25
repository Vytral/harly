import { describe, expect, it } from "vitest";

import { filterLibraryItems, libraryItems } from "./library";

describe("T07 — library search and clickable blocks", () => {
  it("filters actions by label without requiring JSON", () => {
    const items = libraryItems();
    const email = filterLibraryItems(items, "email");
    expect(email.some((item) => item.label.toLowerCase().includes("email"))).toBe(true);
    expect(email.every((item) => item.blurb.length > 0 || item.label.length > 0)).toBe(true);
  });

  it("carries the manifest-selected tool version into new action blocks", () => {
    const items = libraryItems([{ type: "send_email", version: 3 }]);
    expect(items.find((item) => item.id === "action:send_email")).toMatchObject({
      toolVersion: 3,
    });
    expect(items.some((item) => item.id === "action:add_note")).toBe(false);
  });

  it("keeps control blocks discoverable by everyday words", () => {
    const wait = filterLibraryItems(libraryItems(), "approval");
    expect(wait.map((item) => item.kind)).toContain("approval");
  });

  it("prioritizes exact matches like 'End' over partial matches like 'Send email'", () => {
    const results = filterLibraryItems(libraryItems(), "end");
    expect(results[0]?.kind).toBe("end");
  });
});
