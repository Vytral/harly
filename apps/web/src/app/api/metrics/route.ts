import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { renderOperationalMetrics, renderPrometheusMetrics } from "@/server/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tokenMatches(supplied: string | null, expected: string): boolean {
  if (!supplied) return false;
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(supplied), digest(`Bearer ${expected}`));
}

export async function GET(request: Request) {
  const expected = process.env.METRICS_TOKEN;
  if (!expected || !tokenMatches(request.headers.get("authorization"), expected)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const metrics = await renderPrometheusMetrics();
  if ((request.headers.get("accept") ?? "").includes("application/json")) return NextResponse.json({ metrics, operational: await renderOperationalMetrics() }, { headers: { "Cache-Control": "no-store" } });
  return new Response(metrics, { headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8", "Cache-Control": "no-store" } });
}
