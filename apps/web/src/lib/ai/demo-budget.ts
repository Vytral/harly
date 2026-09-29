import "server-only";

import { demoAiSettings } from "@harly/config";

import { enforcePersistentRateLimit } from "@/server/api/ratelimit";

/**
 * Spend budgets for the public demo's platform-funded Harly AI.
 *
 * Always on the Postgres-backed limiter (the existing rate_limit_buckets
 * table, which has no workspace_id so the demo reseed never wipes it), so a
 * restart or redeploy can't hand out a fresh daily budget. Every other
 * limiter keeps its normal store.
 */

const DAY_MS = 24 * 60 * 60_000;

export const DEMO_CHAT_IP_LIMIT_PER_MINUTE = 6;
export const DEMO_CHAT_IP_LIMIT_PER_DAY = 60;

/**
 * Consume one slot of the instance-wide daily demo AI budget. Returns false
 * once exhausted (or on a limiter error: fail closed), and callers treat that
 * as "AI not configured" so every AI surface degrades to its non-AI path.
 */
export async function consumeDemoAiDailyBudget(
  source: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const settings = demoAiSettings(source);
  if (!settings || settings.dailyRequestLimit <= 0) return false;
  try {
    await enforcePersistentRateLimit("demo-ai:daily", {
      limit: settings.dailyRequestLimit,
      windowMs: DAY_MS,
    });
    return true;
  } catch {
    return false;
  }
}

/** Per-IP chat budget for demo visitors. Throws when exceeded. */
export async function enforceDemoChatIpLimits(ip: string): Promise<void> {
  await Promise.all([
    enforcePersistentRateLimit(`demo-ai:chat:ip:min:${ip}`, {
      limit: DEMO_CHAT_IP_LIMIT_PER_MINUTE,
      windowMs: 60_000,
    }),
    enforcePersistentRateLimit(`demo-ai:chat:ip:day:${ip}`, {
      limit: DEMO_CHAT_IP_LIMIT_PER_DAY,
      windowMs: DAY_MS,
    }),
  ]);
}
