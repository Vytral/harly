import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { declineNativeSignature } from "@/lib/esign/native/decline";
import { resolveNativeSigningToken } from "@/lib/esign/native/remote";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().trim().max(500).optional() });

/** A signer declines. Needs only the personal link; no email code is required to say no. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = await resolveNativeSigningToken(token);
  if (!target) return NextResponse.json({ error: "Signing link is invalid or expired." }, { status: 404 });
  try { await enforceRateLimit(`native-decline:${clientIp(request)}:${target.recipientId}`, { limit: 5, windowMs: 10 * 60_000 }); } catch { return NextResponse.json({ error: "Too many requests." }, { status: 429 }); }
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "The reason is too long." }, { status: 400 });
  const result = await declineNativeSignature(target, { reason: parsed.data.reason ?? null, ipAddress: clientIp(request), userAgent: request.headers.get("user-agent") });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
