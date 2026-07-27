import { NextResponse } from "next/server";
import { renderOperationalMetrics, renderPrometheusMetrics } from "@/server/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const expected = process.env.METRICS_TOKEN;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if ((request.headers.get("accept") ?? "").includes("application/json")) return NextResponse.json({ metrics: renderPrometheusMetrics(), operational: await renderOperationalMetrics() }, { headers: { "Cache-Control": "no-store" } });
  return new Response(renderPrometheusMetrics(), { headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8", "Cache-Control": "no-store" } });
}
