import { describe, expect, it } from "vitest";

import { buildCalBookingLink } from "./link";

describe("buildCalBookingLink", () => {
  it("prefills name and email as query params", () => {
    const link = buildCalBookingLink({
      bookingUrl: "https://cal.com/acme/interview",
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
    const url = new URL(link);
    expect(url.searchParams.get("name")).toBe("Ada Lovelace");
    expect(url.searchParams.get("email")).toBe("ada@example.com");
  });

  it("stuffs ids into metadata params so the webhook can resolve them", () => {
    const link = buildCalBookingLink({
      bookingUrl: "https://cal.com/acme/interview",
      metadata: { applicationId: "app_1", candidateId: "cand_1" },
    });
    const url = new URL(link);
    expect(url.searchParams.get("metadata[applicationId]")).toBe("app_1");
    expect(url.searchParams.get("metadata[candidateId]")).toBe("cand_1");
  });

  it("skips empty values", () => {
    const link = buildCalBookingLink({
      bookingUrl: "https://cal.com/acme/interview",
      name: "",
      email: null,
      metadata: { applicationId: "", candidateId: "cand_1" },
    });
    const url = new URL(link);
    expect(url.searchParams.has("name")).toBe(false);
    expect(url.searchParams.has("email")).toBe(false);
    expect(url.searchParams.has("metadata[applicationId]")).toBe(false);
    expect(url.searchParams.get("metadata[candidateId]")).toBe("cand_1");
  });

  it("preserves existing query params on the booking URL", () => {
    const link = buildCalBookingLink({
      bookingUrl: "https://cal.com/acme/interview?month=2026-07",
      email: "ada@example.com",
    });
    const url = new URL(link);
    expect(url.searchParams.get("month")).toBe("2026-07");
    expect(url.searchParams.get("email")).toBe("ada@example.com");
  });

  it("returns the input unchanged when the booking URL is invalid", () => {
    const link = buildCalBookingLink({
      bookingUrl: "not-a-url",
      email: "ada@example.com",
    });
    expect(link).toBe("not-a-url");
  });
});
