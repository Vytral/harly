import { afterEach, describe, expect, it, vi } from "vitest";
import { formatRelative, formatShort } from "./date";

afterEach(() => vi.useRealTimers());
describe("localized date formatting", () => {
  it("uses the selected language for relative time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T12:00:00Z"));
    const value = new Date("2026-05-03T12:00:00Z");
    expect(formatRelative(value, "es")).toBe(new Intl.RelativeTimeFormat("es", { numeric: "auto" }).format(-2, "day"));
    expect(formatRelative(value, "nl-NL")).toBe(new Intl.RelativeTimeFormat("nl-NL", { numeric: "auto" }).format(-2, "day"));
  });
  it("uses a locale-aware short date and retains the English default", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T12:00:00Z"));
    const value = new Date("2026-05-03T12:00:00Z");
    expect(formatShort(value, "fr")).toBe(new Intl.DateTimeFormat("fr", { month: "short", day: "numeric" }).format(value));
    expect(formatShort(value, "en")).toBe(new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(value));
  });
});
