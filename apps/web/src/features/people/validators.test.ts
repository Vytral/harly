import { describe, expect, it } from "vitest";

import {
  capacityHoursPerWeekSchema,
  normalizeUsername,
  preferredEmailLocaleSchema,
  profileUrlSchema,
  timeRangeSchema,
  updateProfileSchema,
  usernameSchema,
  weeklyAvailabilitySchema,
} from "./validators";

describe("preferredEmailLocaleSchema", () => {
  it("normalizes supported tags to their canonical form", () => {
    expect(preferredEmailLocaleSchema.parse(" PT-br ")).toBe("pt-BR");
    expect(preferredEmailLocaleSchema.parse("NL-nl")).toBe("nl-NL");
  });

  it("accepts null and rejects unsupported values", () => {
    expect(preferredEmailLocaleSchema.parse(null)).toBeNull();
    expect(preferredEmailLocaleSchema.safeParse("pt-PT").success).toBe(false);
    expect(preferredEmailLocaleSchema.safeParse(4).success).toBe(false);
  });
});

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

describe("profile URLs", () => {
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "file:///etc/passwd",
    "ftp://files.example.test/me",
    "vbscript:msgbox(1)",
    "https://",
  ])("rejects %s", (value) => {
    expect(profileUrlSchema.safeParse(value).success).toBe(false);
    expect(
      updateProfileSchema.safeParse({ name: "Ada", websiteUrl: value }).success,
    ).toBe(false);
  });

  it("accepts http(s) links and trims them", () => {
    expect(profileUrlSchema.parse(" https://example.com/in/ada ")).toBe("https://example.com/in/ada");
    expect(profileUrlSchema.parse("http://example.com")).toBe("http://example.com");
  });

  it("adds https to scheme-less links and clears blanks", () => {
    expect(profileUrlSchema.parse("example.com/in/ada")).toBe("https://example.com/in/ada");
    expect(profileUrlSchema.parse("localhost:3000/x")).toBe("https://localhost:3000/x");
    expect(profileUrlSchema.parse("")).toBeNull();
    expect(profileUrlSchema.parse(null)).toBeNull();
    expect(profileUrlSchema.parse(undefined)).toBeNull();
  });

  it("validates every profile link field", () => {
    for (const field of ["linkedinUrl", "githubUrl", "websiteUrl"]) {
      expect(
        updateProfileSchema.safeParse({ name: "Ada", [field]: "javascript:alert(1)" }).success,
      ).toBe(false);
    }
    expect(updateProfileSchema.safeParse({ name: "Ada" }).success).toBe(true);
  });
});
