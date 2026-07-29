import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import process from "node:process";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { pruneCache } from "./cache";

import {
  formatConfigError,
  loadHarlyConfig,
  validateRuntimeFilesystem,
} from "../../../packages/config/src/index";

const command = process.argv[2] ?? "serve";

function jsonLog(
  level: "info" | "error" | "warn",
  event: string,
  fields: Record<string, unknown> = {},
) {
  const output = JSON.stringify({
    level,
    event,
    time: new Date().toISOString(),
    ...fields,
  });
  (level === "error" ? process.stderr : process.stdout).write(`${output}\n`);
}

async function runtimeConfig(options: { validateFilesystem?: boolean } = {}) {
  try {
    const config = loadHarlyConfig();
    if (options.validateFilesystem !== false) {
      await validateRuntimeFilesystem(config);
    }
    return config;
  } catch (error) {
    process.stderr.write(`${formatConfigError(error)}\n`);
    process.exitCode = 1;
    throw error;
  }
}

async function pruneRuntimeCache() {
  const directory = process.env.HARLY_CACHE_DIR ?? "/app/apps/web/.next/cache";
  const maxMb = Number.parseInt(process.env.HARLY_CACHE_MAX_MB ?? "512", 10);
  const maxAgeDays = Number.parseInt(
    process.env.HARLY_CACHE_MAX_AGE_DAYS ?? "7",
    10,
  );
  try {
    const result = await pruneCache({ directory, maxMb, maxAgeDays });
    jsonLog("info", "cache.pruned", result);
  } catch {
    jsonLog("warn", "cache.configuration.invalid");
  }
}

async function serve() {
  await runtimeConfig();
  await pruneRuntimeCache();
  const cacheTimer = setInterval(
    () => void pruneRuntimeCache(),
    6 * 60 * 60 * 1_000,
  );
  cacheTimer.unref();
  const child = spawn(
    process.execPath,
    [process.env.HARLY_SERVER_PATH ?? "/app/apps/web/server.js"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        HOSTNAME: "0.0.0.0",
        PORT: process.env.PORT ?? "3000",
      },
    },
  );
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => child.kill(signal));
  }
  const exitCode = await new Promise<number>((resolve) => {
    child.once("exit", (code) => resolve(code ?? 1));
  });
  clearInterval(cacheTimer);
  process.exitCode = exitCode;
}

async function runMigrations() {
  const config = await runtimeConfig({ validateFilesystem: false });
  const client = postgres(config.DATABASE_URL!, { max: 1, prepare: false });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: process.env.HARLY_MIGRATIONS_DIR ?? "/app/migrations",
    });
    jsonLog("info", "migrations.complete", { version: config.HARLY_VERSION });
  } finally {
    await client.end();
  }
}

type Job = { name: string; path: string; intervalMs: number };
const jobs: Job[] = [
  {
    name: "domain-events",
    path: "/api/cron/domain-events",
    intervalMs: 15_000,
  },
  { name: "email-outbox", path: "/api/cron/email-outbox", intervalMs: 60_000 },
  {
    name: "webhooks-dispatch",
    path: "/api/cron/webhooks/dispatch",
    intervalMs: 60_000,
  },
  {
    name: "esign-reconciliation",
    path: "/api/cron/esign-reconciliation",
    intervalMs: 60_000,
  },
  {
    name: "interview-sync",
    path: "/api/cron/interview-sync",
    intervalMs: 60_000,
  },
  {
    name: "evaluation-jobs",
    path: "/api/cron/evaluation-jobs",
    intervalMs: 60_000,
  },
  { name: "mailbox-sync", path: "/api/cron/mailbox-sync", intervalMs: 120_000 },
  {
    name: "document-expiry",
    path: "/api/cron/document-expiry",
    intervalMs: 60_000,
  },
  {
    name: "retention-enforcement",
    path: "/api/cron/retention-enforcement",
    intervalMs: 60_000,
  },
  {
    name: "candidate-deletions",
    path: "/api/cron/candidate-deletions",
    intervalMs: 60_000,
  },
  {
    name: "candidate-reconciliation",
    path: "/api/cron/candidate-reconciliation",
    intervalMs: 24 * 60 * 60_000,
  },
  {
    name: "scheduled-reports",
    path: "/api/cron/scheduled-reports",
    intervalMs: 60_000,
  },
];

const schedulerStaleAfterMs = Math.max(
  60_000,
  Number.parseInt(
    process.env.HARLY_SCHEDULER_STALE_AFTER_SECONDS ?? "300",
    10,
  ) * 1_000 || 300_000,
);

function describeSchedulerRuns(
  runs: Record<string, string | null> | null | undefined,
) {
  const cutoff = Date.now() - schedulerStaleAfterMs;
  const details = jobs.map((job) => {
    const value = runs?.[job.name];
    const timestamp = value ? new Date(value).getTime() : Number.NaN;
    if (!value || Number.isNaN(timestamp)) return `${job.name}=never`;
    return `${job.name}=${new Date(timestamp).toISOString()}${timestamp < cutoff ? " (stale)" : ""}`;
  });
  const ok = jobs.every((job) => {
    const value = runs?.[job.name];
    const timestamp = value ? new Date(value).getTime() : Number.NaN;
    return !Number.isNaN(timestamp) && timestamp >= cutoff;
  });
  return { ok, detail: details.join(" ") };
}

async function scheduler() {
  const config = await runtimeConfig({ validateFilesystem: false });
  const appOrigin = process.env.HARLY_INTERNAL_URL ?? "http://app:3000";
  const database = postgres(config.DATABASE_URL!, { max: 2, prepare: false });
  let stopping = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const schedule = (job: Job, delay: number) => {
    if (stopping) return;
    const timer = setTimeout(async () => {
      timers.delete(timer);
      await execute(job);
      const jitter = Math.floor(Math.random() * job.intervalMs * 0.1);
      schedule(job, job.intervalMs + jitter);
    }, delay);
    timers.add(timer);
  };

  const execute = async (job: Job) => {
    const runId = randomUUID();
    const started = Date.now();
    let status = "success";
    let counters: Record<string, unknown> = {};
    try {
      const response = await fetch(`${appOrigin}${job.path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.CRON_SECRET}` },
        signal: AbortSignal.timeout(30_000),
      });
      const body = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      counters = Object.fromEntries(
        Object.entries(body).filter(
          ([, value]) =>
            typeof value === "number" || typeof value === "boolean",
        ),
      );
      if (!response.ok && response.status !== 409)
        throw new Error(`HTTP ${response.status}`);
      if (response.status === 409) status = "skipped";
      jsonLog("info", "scheduler.run", {
        job: job.name,
        runId,
        status,
        durationMs: Date.now() - started,
        counters,
      });
    } catch {
      status = "failed";
      jsonLog("error", "scheduler.run", {
        job: job.name,
        runId,
        status,
        durationMs: Date.now() - started,
      });
    }
    await database`
      insert into cron_runs (job, run_id, status, duration_ms, counters)
      values (${job.name}, ${runId}, ${status}, ${Date.now() - started}, ${database.json(counters)})
    `.catch(() => undefined);
  };

  while (!stopping) {
    try {
      const ready = await fetch(`${appOrigin}/api/health/ready`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (ready.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }

  await database`delete from cron_runs where created_at < now() - interval '30 days'`.catch(
    () => undefined,
  );
  jobs.forEach((job, index) => schedule(job, index * 1_000));
  const heartbeat = setInterval(
    () => jsonLog("info", "scheduler.heartbeat", { jobs: jobs.length }),
    60_000,
  );

  await new Promise<void>((resolve) => {
    const stop = () => {
      stopping = true;
      clearInterval(heartbeat);
      timers.forEach(clearTimeout);
      resolve();
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  });
  await database.end();
}

async function doctor() {
  // Doctor runs inside the read-only scheduler container as its healthcheck;
  // it must not attempt to create the local upload directory there.
  const config = await runtimeConfig({ validateFilesystem: false });
  const appOrigin = process.env.HARLY_INTERNAL_URL ?? config.HARLY_URL;
  const database = postgres(config.DATABASE_URL!, { max: 1, prepare: false });
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
  try {
    const health = await fetch(`${appOrigin}/api/health/ready`, {
      signal: AbortSignal.timeout(3_000),
    });
    checks.push({
      name: "readiness",
      ok: health.ok,
      detail: `HTTP ${health.status}`,
    });
  } catch {
    checks.push({ name: "readiness", ok: false, detail: "unreachable" });
  }
  try {
    const [row] = await database`
      select
        to_regclass('public.deployment_bootstrap') is not null as migrated,
        (
          select coalesce(json_object_agg(job, last_run), '{}'::json)
          from (
            select job, max(created_at) filter (where status in ('success', 'skipped')) as last_run
            from cron_runs
            where job in ('domain-events', 'email-outbox', 'webhooks-dispatch', 'esign-reconciliation', 'interview-sync', 'evaluation-jobs', 'mailbox-sync', 'document-expiry', 'retention-enforcement', 'candidate-deletions', 'candidate-reconciliation', 'scheduled-reports')
            group by job
          ) scheduler_runs
        ) as scheduler_runs,
        (select count(*)::int from email_outbox where status in ('pending', 'processing')) as email_pending,
        (select count(*)::int from webhook_deliveries where status in ('pending', 'failed', 'processing')) as webhook_pending,
        (select count(*)::int from evaluation_jobs where status in ('pending', 'failed', 'running')) as evaluation_pending,
        (select count(*)::int from evaluation_jobs where status = 'dead_letter') as evaluation_dead_letter,
        (select count(*)::int from evaluation_jobs where status = 'running' and locked_at < now() - interval '15 minutes') as evaluation_stale
    `;
    checks.push({ name: "migrations", ok: row?.migrated === true });
    const scheduler = describeSchedulerRuns(
      row?.scheduler_runs as Record<string, string | null> | null | undefined,
    );
    checks.push({ name: "scheduler", ...scheduler });
    const evaluationDeadLetter = Number(row?.evaluation_dead_letter ?? 0);
    const evaluationStale = Number(row?.evaluation_stale ?? 0);
    checks.push({
      name: "queues",
      ok: evaluationDeadLetter === 0 && evaluationStale === 0,
      detail: `email=${row?.email_pending ?? 0} webhooks=${row?.webhook_pending ?? 0} evaluation=${row?.evaluation_pending ?? 0} evaluation_dead_letter=${evaluationDeadLetter} evaluation_stale=${evaluationStale}`,
    });
  } catch {
    checks.push({ name: "database", ok: false, detail: "query failed" });
  } finally {
    await database.end();
  }
  process.stdout.write(
    `${JSON.stringify({ ok: checks.every((check) => check.ok), checks }, null, 2)}\n`,
  );
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}

const commands: Record<string, () => Promise<void>> = {
  serve,
  migrate: runMigrations,
  scheduler,
  doctor,
};

if (!commands[command]) {
  process.stderr.write(`Unknown command: ${command}\n`);
  process.exitCode = 2;
} else {
  commands[command]().catch((error) => {
    if (!process.exitCode) process.exitCode = 1;
    jsonLog("error", "runtime.fatal", {
      command,
      message: error instanceof Error ? error.message : "unknown error",
    });
  });
}
