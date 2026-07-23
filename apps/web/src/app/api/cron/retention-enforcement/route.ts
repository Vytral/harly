import { NextResponse, type NextRequest } from "next/server";

import {
  anonymizeCandidateForRetention,
  findDueCandidatesForRetention,
} from "@/features/candidates/retention";
import { authorizeCron } from "@/server/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "retention-enforcement";
const BATCH_SIZE = 25;

export async function POST(request: NextRequest) {
  const auth = await authorizeCron(request, CRON_KEY);
  if (!auth.ok) return auth.response;
  try {
    const due = await findDueCandidatesForRetention(BATCH_SIZE);
    let anonymized = 0;
    let skipped = 0;
    let failed = 0;
    for (const candidate of due) {
      const outcome = await anonymizeCandidateForRetention(
        candidate.id,
        candidate.workspaceId,
        candidate.thresholdMonths,
      );
      if (outcome === "anonymized") anonymized += 1;
      else if (outcome === "failed") failed += 1;
      else skipped += 1;
    }
    return NextResponse.json({ ok: true, due: due.length, anonymized, skipped, failed });
  } finally {
    await auth.release();
  }
}
