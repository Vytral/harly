import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { claimNextRequest } from "@/features/updates/updater-service";
import { rejectUnlessUpdater } from "@/features/updates/updater-auth";

export const runtime = "nodejs";
// Never cache , every poll is a heartbeat and may claim work.
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  updaterVersion: z.string().trim().max(40).optional(),
});

/**
 * The host updater's poll (`harly updater run`). Authenticated with the derived
 * updater token. Returns the request to execute, or `{ request: null }`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rejected = rejectUnlessUpdater(request);
  if (rejected) return rejected;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const claimed = await claimNextRequest({
    updaterVersion: parsed.data.updaterVersion ?? null,
  });
  return NextResponse.json({ request: claimed });
}
