import { describe, expect, it } from "vitest";

import {
  canTransition,
  isUpdaterOnline,
  statusesBefore,
} from "./update-request-state";

describe("update request lifecycle", () => {
  it("moves forward only", () => {
    expect(canTransition("pending", "claimed")).toBe(true);
    expect(canTransition("claimed", "running")).toBe(true);
    expect(canTransition("running", "succeeded")).toBe(true);
    expect(canTransition("running", "pending")).toBe(false);
    expect(canTransition("pending", "succeeded")).toBe(false);
  });

  it("never leaves a terminal state, even to repeat it", () => {
    for (const status of ["succeeded", "failed", "rolled_back", "cancelled"] as const) {
      expect(canTransition(status, "running")).toBe(false);
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("lets an active request repeat its own status", () => {
    expect(canTransition("running", "running")).toBe(true);
  });

  it("lets only a pending request be cancelled", () => {
    expect(statusesBefore("cancelled")).toEqual(["pending"]);
    expect(statusesBefore("running")).toEqual(["claimed"]);
  });
});

describe("isUpdaterOnline", () => {
  const now = new Date("2026-03-02T12:00:00Z");
  it("is online for a recent poll and offline otherwise", () => {
    expect(isUpdaterOnline(new Date("2026-03-02T11:57:00Z"), now)).toBe(true);
    expect(isUpdaterOnline(new Date("2026-03-02T11:50:00Z"), now)).toBe(false);
    expect(isUpdaterOnline(null, now)).toBe(false);
  });
});
