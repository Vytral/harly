import "server-only";

import { and, count, eq, inArray, isNull, lte, lt, or } from "drizzle-orm";
import {
  candidateDeletionJobs,
  db,
  mailIdempotencyKeys,
  sql,
  workflowNodeExecutions,
  workflowRuns,
} from "@harly/db";

type Histogram = {
  buckets: number[];
  counts: number[];
  sum: number;
  count: number;
};
type MetricsState = {
  counters: Map<string, number>;
  httpDuration: Histogram;
  sseLatency: Histogram;
  workflowActionDuration: Histogram;
  sseConnections: number;
  sseEvents: number;
};

const BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const histogram = (): Histogram => ({
  buckets: BUCKETS,
  counts: Array(BUCKETS.length).fill(0),
  sum: 0,
  count: 0,
});
declare global {
  var harlyMetrics: MetricsState | undefined;
}
const state: MetricsState = globalThis.harlyMetrics ?? {
  counters: new Map(),
  httpDuration: histogram(),
  sseLatency: histogram(),
  workflowActionDuration: histogram(),
  sseConnections: 0,
  sseEvents: 0,
};
// Preserve counters across development hot reloads while initializing fields
// added by a newer module version.
state.workflowActionDuration ??= histogram();
if (process.env.NODE_ENV !== "production") globalThis.harlyMetrics = state;

const safeLabel = (value: string) => value.replaceAll(/[^a-zA-Z0-9_.:-]/g, "_");
function increment(key: string) {
  state.counters.set(key, (state.counters.get(key) ?? 0) + 1);
}
function observe(target: Histogram, seconds: number) {
  target.count += 1;
  target.sum += seconds;
  target.buckets.forEach((bucket, index) => {
    if (seconds <= bucket) target.counts[index]! += 1;
  });
}

export function recordHttpRequest(input: {
  method: string;
  route: string;
  status: number;
  durationMs: number;
}) {
  increment(
    `http|${safeLabel(input.method)}|${safeLabel(input.route)}|${Math.floor(input.status / 100)}xx`,
  );
  observe(state.httpDuration, Math.max(0, input.durationMs) / 1000);
}
export function recordHttpError(route: string) {
  increment(`http_error|${safeLabel(route)}`);
}
export function recordCronRun(status: "succeeded" | "failed") {
  increment(`cron_${status}`);
}
export function recordSlackDelivery(
  status: "success" | "failed" | "dead_letter",
) {
  increment(`slack_delivery_${status}`);
}
export function recordWorkflowNodeAttempt(input: {
  actionType: string;
  status: "succeeded" | "failed" | "uncertain";
  durationMs: number;
}) {
  increment(
    `workflow_node_attempt|${safeLabel(input.actionType)}|${safeLabel(input.status)}`,
  );
  observe(state.workflowActionDuration, Math.max(0, input.durationMs) / 1000);
}

export function recordAutomationGuardDecision(code: string) {
  increment(`automation_guard|${safeLabel(code)}`);
}
export function recordSseConnection(delta: 1 | -1) {
  state.sseConnections = Math.max(0, state.sseConnections + delta);
  increment(delta === 1 ? "sse_connection_opened" : "sse_connection_closed");
}
export function recordSseEvent(latencyMs?: number) {
  state.sseEvents += 1;
  increment("sse_event_delivered");
  if (latencyMs !== undefined)
    observe(state.sseLatency, Math.max(0, latencyMs) / 1000);
}

async function readCandidateDeletionQueue() {
  const [byStatus, staleRows] = await Promise.all([
    db
      .select({ status: candidateDeletionJobs.status, count: count() })
      .from(candidateDeletionJobs)
      .groupBy(candidateDeletionJobs.status),
    db
      .select({ count: count() })
      .from(candidateDeletionJobs)
      .where(
        and(
          eq(candidateDeletionJobs.status, "processing"),
          or(
            isNull(candidateDeletionJobs.lockedAt),
            lt(
              candidateDeletionJobs.lockedAt,
              new Date(Date.now() - 15 * 60_000),
            ),
          ),
        ),
      ),
  ]);
  const counts = new Map(byStatus.map((row) => [row.status, row.count]));
  return {
    pending: counts.get("pending") ?? 0,
    processing: counts.get("processing") ?? 0,
    failed: counts.get("failed") ?? 0,
    blocked: counts.get("blocked") ?? 0,
    deadLetter: counts.get("dead_letter") ?? 0,
    stale: staleRows[0]?.count ?? 0,
  };
}

async function readMailDeliveryQueue() {
  const [byStatus, staleRows] = await Promise.all([
    db
      .select({ status: mailIdempotencyKeys.status, count: count() })
      .from(mailIdempotencyKeys)
      .groupBy(mailIdempotencyKeys.status),
    db
      .select({ count: count() })
      .from(mailIdempotencyKeys)
      .where(
        and(
          eq(mailIdempotencyKeys.status, "sending"),
          lt(
            mailIdempotencyKeys.updatedAt,
            new Date(Date.now() - 15 * 60_000),
          ),
        ),
      ),
  ]);
  const counts = new Map(byStatus.map((row) => [row.status, row.count]));
  return {
    pending: counts.get("pending") ?? 0,
    sending: counts.get("sending") ?? 0,
    sent: counts.get("sent") ?? 0,
    failed: counts.get("failed") ?? 0,
    unknown: counts.get("unknown") ?? 0,
    stale: staleRows[0]?.count ?? 0,
  };
}

async function readWorkflowQueue() {
  const [byState, staleRows, dueRows, waitingRows, uncertainRows] = await Promise.all([
    db
      .select({
        logicalStatus: workflowRuns.logicalStatus,
        status: workflowRuns.status,
        count: count(),
      })
      .from(workflowRuns)
      .groupBy(workflowRuns.logicalStatus, workflowRuns.status),
    db
      .select({ count: count() })
      .from(workflowRuns)
      .where(
        or(
          and(
            eq(workflowRuns.engineVersion, 2),
            eq(workflowRuns.logicalStatus, "running"),
            or(
              isNull(workflowRuns.leaseUntil),
              lt(workflowRuns.leaseUntil, new Date()),
            ),
          ),
          and(
            eq(workflowRuns.engineVersion, 1),
            eq(workflowRuns.status, "running"),
            lt(workflowRuns.startedAt, new Date(Date.now() - 5 * 60_000)),
          ),
        ),
      ),
    db
      .select({ count: count() })
      .from(workflowRuns)
      .where(and(
        eq(workflowRuns.engineVersion, 2),
        inArray(workflowRuns.logicalStatus, ["queued", "retrying"]),
        lte(workflowRuns.nextAttemptAt, new Date()),
      )),
    db
      .select({ kind: workflowNodeExecutions.waitingKind, count: count() })
      .from(workflowNodeExecutions)
      .where(eq(workflowNodeExecutions.status, "waiting"))
      .groupBy(workflowNodeExecutions.waitingKind),
    db
      .select({ count: count() })
      .from(workflowNodeExecutions)
      .where(eq(workflowNodeExecutions.status, "uncertain")),
  ]);
  const counts = new Map<string, number>();
  for (const row of byState) {
    const state = row.logicalStatus ?? row.status;
    counts.set(state, (counts.get(state) ?? 0) + Number(row.count));
  }
  return {
    states: counts,
    due: Number(dueRows[0]?.count ?? 0),
    waitingByKind: waitingRows.map((row) => ({ kind: row.kind ?? "unknown", count: Number(row.count) })),
    uncertain: Number(uncertainRows[0]?.count ?? 0),
    stale: Number(staleRows[0]?.count ?? 0),
  };
}

function histogramLines(name: string, target: Histogram) {
  return target.buckets
    .map(
      (bucket, index) =>
        `${name}_bucket{le="${bucket}"} ${target.counts[index]}`,
    )
    .concat(
      `${name}_bucket{le="+Inf"} ${target.count}`,
      `${name}_sum ${target.sum}`,
      `${name}_count ${target.count}`,
    );
}

export async function renderPrometheusMetrics() {
  const lines = [
    "# TYPE harly_http_requests_total counter",
    ...[...state.counters.entries()]
      .filter(([key]) => key.startsWith("http|"))
      .map(([key, value]) => {
        const [, method, route, status] = key.split("|");
        return `harly_http_requests_total{method="${method}",route="${route}",status="${status}"} ${value}`;
      }),
    "# TYPE harly_http_request_duration_seconds histogram",
    ...histogramLines(
      "harly_http_request_duration_seconds",
      state.httpDuration,
    ),
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
    "# TYPE harly_slack_deliveries_total counter",
    `harly_slack_deliveries_total{status="success"} ${state.counters.get("slack_delivery_success") ?? 0}`,
    `harly_slack_deliveries_total{status="failed"} ${state.counters.get("slack_delivery_failed") ?? 0}`,
    `harly_slack_deliveries_total{status="dead_letter"} ${state.counters.get("slack_delivery_dead_letter") ?? 0}`,
    "# TYPE harly_workflow_node_attempts_total counter",
    ...[...state.counters.entries()]
      .filter(([key]) => key.startsWith("workflow_node_attempt|"))
      .map(([key, value]) => {
        const [, actionType, status] = key.split("|");
        return `harly_workflow_node_attempts_total{action_type="${actionType}",status="${status}"} ${value}`;
      }),
    "# TYPE harly_automation_guard_denials_total counter",
    ...[...state.counters.entries()]
      .filter(([key]) => key.startsWith("automation_guard|"))
      .map(([key, value]) => {
        const [, code] = key.split("|");
        return `harly_automation_guard_denials_total{code="${code}"} ${value}`;
      }),
    "# TYPE harly_workflow_node_attempt_duration_seconds histogram",
    ...histogramLines(
      "harly_workflow_node_attempt_duration_seconds",
      state.workflowActionDuration,
    ),
  ];
  const queue = await sql`
    select
      count(*) filter (where status in ('pending', 'failed', 'running'))::int as pending,
      count(*) filter (where status = 'dead_letter')::int as dead_letter,
      count(*) filter (where status = 'running' and locked_at < now() - interval '15 minutes')::int as stale
    from evaluation_jobs
  `.catch(() => [{ pending: 0, dead_letter: 0, stale: 0 }]);
  const current = queue[0] ?? { pending: 0, dead_letter: 0, stale: 0 };
  lines.push(
    "# TYPE harly_evaluation_jobs gauge",
    `harly_evaluation_jobs{state="pending"} ${current.pending}`,
    `harly_evaluation_jobs{state="dead_letter"} ${current.dead_letter}`,
    `harly_evaluation_jobs{state="stale"} ${current.stale}`,
  );
  const deletionCurrent = await readCandidateDeletionQueue().catch(() => ({
    pending: 0,
    processing: 0,
    failed: 0,
    blocked: 0,
    deadLetter: 0,
    stale: 0,
  }));
  lines.push(
    "# TYPE harly_candidate_deletion_jobs gauge",
    `harly_candidate_deletion_jobs{state="pending"} ${deletionCurrent.pending}`,
    `harly_candidate_deletion_jobs{state="processing"} ${deletionCurrent.processing}`,
    `harly_candidate_deletion_jobs{state="failed"} ${deletionCurrent.failed}`,
    `harly_candidate_deletion_jobs{state="dead_letter"} ${deletionCurrent.deadLetter}`,
    `harly_candidate_deletion_jobs{state="blocked"} ${deletionCurrent.blocked}`,
    `harly_candidate_deletion_jobs{state="stale"} ${deletionCurrent.stale}`,
  );
  const mailCurrent = await readMailDeliveryQueue().catch(() => ({
    pending: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    unknown: 0,
    stale: 0,
  }));
  lines.push(
    "# TYPE harly_mail_idempotency_keys gauge",
    `harly_mail_idempotency_keys{state="pending"} ${mailCurrent.pending}`,
    `harly_mail_idempotency_keys{state="sending"} ${mailCurrent.sending}`,
    `harly_mail_idempotency_keys{state="sent"} ${mailCurrent.sent}`,
    `harly_mail_idempotency_keys{state="failed"} ${mailCurrent.failed}`,
    `harly_mail_idempotency_keys{state="unknown"} ${mailCurrent.unknown}`,
    `harly_mail_idempotency_keys{state="stale"} ${mailCurrent.stale}`,
  );
  const workflowCurrent = await readWorkflowQueue().catch(() => ({
    states: new Map<string, number>(),
    due: 0,
    waitingByKind: [],
    uncertain: 0,
    stale: 0,
  }));
  const workflowStates = [
    "queued",
    "running",
    "waiting",
    "retrying",
    "succeeded",
    "completed_with_warnings",
    "stopped",
    "failed",
    "dead_letter",
    "cancelled",
    "uncertain",
  ];
  lines.push(
    "# TYPE harly_workflow_runs gauge",
    ...workflowStates.map((state) => `harly_workflow_runs{state="${state}"} ${workflowCurrent.states.get(state) ?? 0}`),
    "# TYPE harly_workflow_runs_due gauge",
    `harly_workflow_runs_due ${workflowCurrent.due}`,
    "# TYPE harly_workflow_waiting_nodes gauge",
    ...workflowCurrent.waitingByKind.map((row) => `harly_workflow_waiting_nodes{kind="${safeLabel(row.kind)}"} ${row.count}`),
    "# TYPE harly_workflow_uncertain_nodes gauge",
    `harly_workflow_uncertain_nodes ${workflowCurrent.uncertain}`,
    "# TYPE harly_workflow_runs_stale gauge",
    `harly_workflow_runs_stale ${workflowCurrent.stale}`,
  );
  return `${lines.join("\n")}\n`;
}

export async function renderOperationalMetrics() {
  const [
    cronRuns,
    emailOutbox,
    webhookDeliveries,
    slackDeliveries,
    evaluationJobs,
    candidateDeletionJobs,
    mailIdempotencyQueue,
    workflowRunsQueue,
  ] = await Promise.all([
    sql`select job, status, count(*)::int as count from cron_runs where created_at > now() - interval '24 hours' group by job, status order by job, status`,
    sql`select status, count(*)::int as count from email_outbox group by status`,
    sql`select status, count(*)::int as count from webhook_deliveries where created_at > now() - interval '24 hours' group by status`,
    sql`select status, count(*)::int as count from slack_deliveries where created_at > now() - interval '24 hours' group by status`,
    sql`select status, count(*)::int as count from evaluation_jobs group by status`,
    sql`select status, count(*)::int as count from candidate_deletion_jobs group by status`,
    db
      .select({ status: mailIdempotencyKeys.status, count: count() })
      .from(mailIdempotencyKeys)
      .groupBy(mailIdempotencyKeys.status),
    db
      .select({ status: workflowRuns.status, count: count() })
      .from(workflowRuns)
      .groupBy(workflowRuns.status),
  ]);
  return {
    cronRuns,
    emailOutbox,
    webhookDeliveries,
    slackDeliveries,
    evaluationJobs,
    candidateDeletionJobs,
    mailIdempotencyKeys: mailIdempotencyQueue,
    workflowRuns: workflowRunsQueue,
  };
}
