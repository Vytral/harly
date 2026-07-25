import { z } from "zod";

import {
  RESERVED_USERNAMES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from "@harly/db";

const MAX_RANGES_PER_DAY = 6;

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export const usernameSchema = z
  .string()
  .trim()
  .min(
    USERNAME_MIN_LENGTH,
    `Username must be at least ${USERNAME_MIN_LENGTH} characters.`,
  )
  .max(
    USERNAME_MAX_LENGTH,
    `Username must be at most ${USERNAME_MAX_LENGTH} characters.`,
  )
  .regex(
    /^[a-z0-9_-]+$/,
    "Username can only contain lowercase letters, numbers, hyphens, and underscores.",
  )
  .refine((value) => !RESERVED_USERNAMES.has(value), {
    message: "This username is reserved.",
  });

const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm format.");

export const timeRangeSchema = z
  .object({
    start: timeOfDaySchema,
    end: timeOfDaySchema,
  })
  .refine((range) => range.start < range.end, {
    message: "Start must be before end.",
    path: ["end"],
  });

const dayRangesSchema = z
  .array(timeRangeSchema)
  .max(MAX_RANGES_PER_DAY, `At most ${MAX_RANGES_PER_DAY} ranges per day.`)
  .refine(
    (ranges) => {
      const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].start < sorted[i - 1].end) return false;
      }
      return true;
    },
    { message: "Ranges cannot overlap." },
  );

export const weeklyAvailabilitySchema = z.object(
  Object.fromEntries(WEEKDAYS.map((day) => [day, dayRangesSchema])) as Record<
    (typeof WEEKDAYS)[number],
    typeof dayRangesSchema
  >,
);

function dedupeTrimmed(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    result.push(value);
  }
  return result;
}

export const specialtiesSchema = z
  .array(z.string().trim().min(1))
  .transform(dedupeTrimmed);
export const languagesSchema = z
  .array(z.string().trim().min(1))
  .transform(dedupeTrimmed);

export const capacityHoursPerWeekSchema = z
  .number()
  .int()
  .min(0)
  .max(168)
  .optional()
  .nullable();

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(200),
  image: z.string().nullable().optional(),
  jobTitle: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  linkedinUrl: z.string().trim().max(500).nullable().optional(),
  githubUrl: z.string().trim().max(500).nullable().optional(),
  websiteUrl: z.string().trim().max(500).nullable().optional(),
  timezone: z.string().trim().max(100).nullable().optional(),
  specialties: specialtiesSchema.optional(),
  languages: languagesSchema.optional(),
  weeklyAvailability: weeklyAvailabilitySchema.nullable().optional(),
  capacityHoursPerWeek: capacityHoursPerWeekSchema,
});

export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

export { normalizeUsername } from "@harly/db";
