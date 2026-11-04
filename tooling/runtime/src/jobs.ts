/**
 * The scheduler's job list. Pure (no side effects) so tests can import it;
 * entrypoint.ts runs a command as soon as it is loaded.
 */
export type Job = {
  name: string;
  path: string;
  intervalMs: number;
  body?: Record<string, unknown>;
  /** Fetch timeout. Must cover the job's largest batch. Defaults to 30 s. */
  timeoutMs?: number;
};

export const DEFAULT_JOB_TIMEOUT_MS = 30_000;

export const baseJobs: Job[] = [
  {
    name: "domain-events",
    path: "/api/cron/domain-events",
    intervalMs: 15_000,
  },
  {
    // The dedicated v2 queue consumer is separate from event ingestion so a
    // slow domain-event batch cannot starve retries, waits, or lease recovery.
    name: "automations",
    path: "/api/cron/automations",
    intervalMs: 10_000,
  },
  // The route processes up to 100 rows, each a provider call; 30 s was too short.
  {
    name: "email-outbox",
    path: "/api/cron/email-outbox",
    intervalMs: 60_000,
    timeoutMs: 150_000,
  },
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
    name: "esign-reminders",
    path: "/api/cron/esign-reminders",
    intervalMs: 60 * 60_000,
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
    name: "mail-reconciliation",
    path: "/api/cron/mail-reconciliation",
    intervalMs: 60_000,
    body: { dryRun: false },
  },
  {
    name: "scheduled-reports",
    path: "/api/cron/scheduled-reports",
    intervalMs: 60_000,
  },
];

// Public demo only. The route 404s unless DEMO_MODE=true, so schedule this job
// ONLY in demo mode — otherwise a normal install's scheduler would call the
// endpoint, get a 404, and log a failed run (polluting health). Keeping it out
// of the base list also keeps doctor()'s scheduler check honest: it never
// expects a demo-reset run where none should happen. Fixed ~2-hour cadence: a
// full reseed is cheap for one workspace and gives every visitor an identical
// clean slate.
export const demoResetJob: Job = {
  name: "demo-reset",
  path: "/api/cron/demo-reset",
  intervalMs: 2 * 60 * 60_000,
};

/**
 * Jobs whose endpoints refuse demo mode by design (assertNotDemo, HTTP 403):
 * scheduling them on a demo instance only logs a failed run every few seconds.
 */
export const DEMO_DISABLED_JOBS: ReadonlySet<string> = new Set(["automations", "domain-events"]);

/**
 * Jobs this instance should actually run and be judged healthy against, so
 * scheduler and doctor share the same list. In demo mode demo-reset joins and
 * the demo-refused jobs drop out.
 */
export function activeJobs(demo: boolean): Job[] {
  if (!demo) return baseJobs;
  return [...baseJobs.filter((job) => !DEMO_DISABLED_JOBS.has(job.name)), demoResetJob];
}
