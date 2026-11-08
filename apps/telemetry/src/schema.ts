import { z } from "zod";

/** Mirrors tooling/harly/src/telemetry.ts (the CLI is the source of truth). */
export const REFERRALS = ["github", "search", "friend", "social", "blog_video", "other"] as const;
export const EVENTS = ["install_completed"] as const;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const TOKEN = /^[a-z0-9_-]{1,32}$/;

export const payloadSchema = z.strictObject({
  schema: z.literal(1),
  event: z.enum(EVENTS),
  instanceId: z.string().max(36).regex(UUID_V4),
  cliVersion: z.string().max(64).regex(SEMVER),
  os: z.string().regex(TOKEN),
  arch: z.string().regex(TOKEN),
  deployMode: z.string().regex(TOKEN).optional(),
  referral: z.enum(REFERRALS).optional(),
});

export type Payload = z.infer<typeof payloadSchema>;
