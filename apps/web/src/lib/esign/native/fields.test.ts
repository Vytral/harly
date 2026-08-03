import { describe, expect, it } from "vitest";

import {
  isNativeOfferAcceptanceAvailable,
  isSignableNativeFieldsSnapshot,
} from "./fields";

describe("native offer field snapshots", () => {
  it("accepts a validated snapshot containing a required signature field", () => {
    expect(
      isSignableNativeFieldsSnapshot([
        {
          id: "signature-1",
          type: "signature",
          page: 1,
          x: 0.1,
          y: 0.8,
          w: 0.3,
          h: 0.1,
          label: "Signature",
          required: true,
          order: 0,
        },
      ]),
    ).toBe(true);
  });

  it.each([
    ["missing snapshot", null],
    ["empty snapshot", []],
    ["text-only snapshot", [{ id: "text-1", type: "text", page: 1 }]],
    ["invalid geometry", [{ id: "signature-1", type: "signature", page: 1, x: 2, y: 0, w: 0.2, h: 0.1, required: true, order: 0 }]],
    ["optional-only signature", [{ id: "signature-1", type: "signature", page: 1, x: 0, y: 0, w: 0.2, h: 0.1, required: false, order: 0 }]],
  ])("rejects %s", (_label, snapshot) => {
    expect(isSignableNativeFieldsSnapshot(snapshot)).toBe(false);
  });
});

describe("native offer acceptance guard", () => {
  const now = new Date("2026-08-03T12:00:00Z");

  it("requires a sent offer and active application", () => {
    expect(
      isNativeOfferAcceptanceAvailable({
        offerStatus: "sent",
        applicationStatus: "active",
        expiresAt: null,
        now,
      }),
    ).toBe(true);
  });

  it.each([
    { offerStatus: "withdrawn", applicationStatus: "active", expiresAt: null },
    { offerStatus: "sent", applicationStatus: "rejected", expiresAt: null },
    { offerStatus: "sent", applicationStatus: "active", expiresAt: new Date("2026-08-02T12:00:00Z") },
  ])("rejects a non-actionable state", (input) => {
    expect(isNativeOfferAcceptanceAvailable({ ...input, now })).toBe(false);
  });
});
