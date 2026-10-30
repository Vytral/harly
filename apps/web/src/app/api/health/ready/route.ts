import { NextResponse } from "next/server";

import { getEmailOutboxHealth } from "@/lib/email/outbox-health";
import { getServerLogger } from "@/lib/logger";
import { harlyVersion, isReady } from "@/lib/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_HEALTH_TIMEOUT_MS = 2_000;

/**
 * Email outbox counts for the detail body only. Warnings and failures here
 * never change the HTTP status: a bad email must not take the app out of
 * rotation. A failed or slow lookup reports `unavailable` instead.
 */
async function emailDetail() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getEmailOutboxHealth(),
      new Promise<{ status: "unavailable" }>((resolve) => {
        timeout = setTimeout(() => resolve({ status: "unavailable" }), EMAIL_HEALTH_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    getServerLogger().warn(error, "email outbox health unavailable for readiness detail");
    return { status: "unavailable" as const };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function GET() {
  let ready = false;
  try {
    ready = await isReady();
  } catch (error) {
    getServerLogger().error(error, "readiness check failed");
  }
  const email = await emailDetail();
  if (ready) {
    return NextResponse.json({ status: "ok", version: harlyVersion, email });
  }
  return NextResponse.json(
    { status: "unavailable", version: harlyVersion, email },
    { status: 503 },
  );
}
