import { describe, expect, it } from "vitest";

import {
  capacityHoursPerWeekSchema,
  normalizeUsername,
  timeRangeSchema,
  usernameSchema,
  weeklyAvailabilitySchema,
} from "./validators";

describe("usernameSchema", () => {
  it("accepts a valid username", () => {
    expect(usernameSchema.safeParse("ada-lovelace").success).toBe(true);
  });

  it("rejects too short", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
  });

  it("rejects too long", () => {
    expect(usernameSchema.safeParse("a".repeat(31)).success).toBe(false);
  });

  it("rejects invalid characters", () => {
    expect(usernameSchema.safeParse("Ada Lovelace!").success).toBe(false);
  });

  it("rejects reserved words", () => {
    expect(usernameSchema.safeParse("admin").success).toBe(false);
    expect(usernameSchema.safeParse("people").success).toBe(false);
  });
});

describe("timeRangeSchema", () => {
  it("accepts a valid range", () => {
    expect(
      timeRangeSchema.safeParse({ start: "09:00", end: "17:00" }).success,
    ).toBe(true);
  });

  it("rejects malformed time", () => {
    expect(
      timeRangeSchema.safeParse({ start: "9:00", end: "17:00" }).success,
    ).toBe(false);
  });

  it("rejects start >= end", () => {
    expect(
      timeRangeSchema.safeParse({ start: "17:00", end: "09:00" }).success,
    ).toBe(false);
    expect(
      timeRangeSchema.safeParse({ start: "09:00", end: "09:00" }).success,
    ).toBe(false);
  });
});

describe("weeklyAvailabilitySchema", () => {
  const emptyWeek = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };

  it("accepts non-overlapping ranges", () => {
    const result = weeklyAvailabilitySchema.safeParse({
      ...emptyWeek,
      monday: [
        { start: "09:00", end: "12:00" },
        { start: "13:00", end: "17:00" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects overlapping ranges on the same day", () => {
    const result = weeklyAvailabilitySchema.safeParse({
      ...emptyWeek,
      monday: [
        { start: "09:00", end: "13:00" },
        { start: "12:00", end: "17:00" },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("capacityHoursPerWeekSchema", () => {
  it("accepts within bounds", () => {
    expect(capacityHoursPerWeekSchema.safeParse(40).success).toBe(true);
  });

  it("rejects negative", () => {
    expect(capacityHoursPerWeekSchema.safeParse(-1).success).toBe(false);
  });

  it("rejects over 168", () => {
    expect(capacityHoursPerWeekSchema.safeParse(169).success).toBe(false);
  });
});

describe("normalizeUsername", () => {
  it("handles empty name", () => {
    expect(normalizeUsername("")).toBe("member");
  });

  it("handles emojis and symbols only", () => {
    expect(normalizeUsername("🎉🔥💯")).toBe("member");
    expect(normalizeUsername("!!!")).toBe("member");
  });

  it("strips accents", () => {
    expect(normalizeUsername("José Ñáñez")).toBe("jose-nanez");
  });

  it("handles repeated spaces and mixed case", () => {
    expect(normalizeUsername("Ada   Lovelace")).toBe("ada-lovelace");
  });

  it("collapses and trims hyphens", () => {
    expect(normalizeUsername("--Ada--Lovelace--")).toBe("ada-lovelace");
  });
});
