import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { applyUpdaterReport } from "@/features/updates/updater-service";
import { rejectUnlessUpdater } from "@/features/updates/updater-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  requestId: z.uuid(),
  status: z.enum(["running", "succeeded", "failed", "rolled_back"]),
  message: z.string().trim().max(500).optional(),
  logTail: z.string().max(16_000).optional(),
});

/**
 * Progress report from the host updater. A report that does not move the
 * request forward (already finished, or never claimed) is refused with 409 so
 * a replayed or stray call cannot rewrite history.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rejected = rejectUnlessUpdater(request);
  if (rejected) return rejected;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  }

  const applied = await applyUpdaterReport(parsed.data);
  return applied
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Report does not apply to this request." }, { status: 409 });
}
