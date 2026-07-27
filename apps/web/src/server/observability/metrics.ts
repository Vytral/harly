import "server-only";

import { sql } from "@harly/db";

type Histogram = { buckets: number[]; counts: number[]; sum: number; count: number };
type MetricsState = {
  counters: Map<string, number>;
  httpDuration: Histogram;
  sseLatency: Histogram;
  sseConnections: number;
  sseEvents: number;
};

const BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const histogram = (): Histogram => ({ buckets: BUCKETS, counts: Array(BUCKETS.length).fill(0), sum: 0, count: 0 });
declare global { var harlyMetrics: MetricsState | undefined; }
const state: MetricsState = globalThis.harlyMetrics ?? { counters: new Map(), httpDuration: histogram(), sseLatency: histogram(), sseConnections: 0, sseEvents: 0 };
if (process.env.NODE_ENV !== "production") globalThis.harlyMetrics = state;

const safeLabel = (value: string) => value.replaceAll(/[^a-zA-Z0-9_.:-]/g, "_");
function increment(key: string) { state.counters.set(key, (state.counters.get(key) ?? 0) + 1); }
function observe(target: Histogram, seconds: number) {
  target.count += 1; target.sum += seconds;
  target.buckets.forEach((bucket, index) => { if (seconds <= bucket) target.counts[index]! += 1; });
}

export function recordHttpRequest(input: { method: string; route: string; status: number; durationMs: number }) {
  increment(`http|${safeLabel(input.method)}|${safeLabel(input.route)}|${Math.floor(input.status / 100)}xx`);
  observe(state.httpDuration, Math.max(0, input.durationMs) / 1000);
}
export function recordHttpError(route: string) { increment(`http_error|${safeLabel(route)}`); }
export function recordCronRun(status: "succeeded" | "failed") { increment(`cron_${status}`); }
export function recordSseConnection(delta: 1 | -1) { state.sseConnections = Math.max(0, state.sseConnections + delta); increment(delta === 1 ? "sse_connection_opened" : "sse_connection_closed"); }
export function recordSseEvent(latencyMs?: number) { state.sseEvents += 1; increment("sse_event_delivered"); if (latencyMs !== undefined) observe(state.sseLatency, Math.max(0, latencyMs) / 1000); }

function histogramLines(name: string, target: Histogram) {
  return target.buckets.map((bucket, index) => `${name}_bucket{le="${bucket}"} ${target.counts[index]}`).concat(`${name}_bucket{le="+Inf"} ${target.count}`, `${name}_sum ${target.sum}`, `${name}_count ${target.count}`);
}

export function renderPrometheusMetrics() {
  const lines = [
    "# TYPE harly_http_requests_total counter",
    ...[...state.counters.entries()].filter(([key]) => key.startsWith("http|" )).map(([key, value]) => { const [, method, route, status] = key.split("|"); return `harly_http_requests_total{method="${method}",route="${route}",status="${status}"} ${value}`; }),
    "# TYPE harly_http_request_duration_seconds histogram",
    ...histogramLines("harly_http_request_duration_seconds", state.httpDuration),
    "# TYPE harly_sse_connections gauge",
    `harly_sse_connections ${state.sseConnections}`,
    "# TYPE harly_sse_events_total counter",
    `harly_sse_events_total ${state.sseEvents}`,
    "# TYPE harly_sse_delivery_latency_seconds histogram",
    ...histogramLines("harly_sse_delivery_latency_seconds", state.sseLatency),
    "# TYPE harly_cron_runs_failed_total counter",
    `harly_cron_runs_failed_total ${state.counters.get("cron_failed") ?? 0}`,
    "# TYPE harly_cron_runs_succeeded_total counter",
    `harly_cron_runs_succeeded_total ${state.counters.get("cron_succeeded") ?? 0}`,
  ];
  return `${lines.join("\n")}\n`;
}

export async function renderOperationalMetrics() {
  const [cronRuns, emailOutbox, webhookDeliveries] = await Promise.all([
    sql`select job, status, count(*)::int as count from cron_runs where created_at > now() - interval '24 hours' group by job, status order by job, status`,
    sql`select status, count(*)::int as count from email_outbox group by status`,
    sql`select status, count(*)::int as count from webhook_deliveries where created_at > now() - interval '24 hours' group by status`,
  ]);
  return { cronRuns, emailOutbox, webhookDeliveries };
}
