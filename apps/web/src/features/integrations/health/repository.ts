import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db, integrationHealth } from "@harly/db";

import { createLogger } from "@/lib/logger";

import {
  DEGRADED_FAILURE_THRESHOLD,
  FAILURE_WINDOW_MS,
  classifyIntegrationError,
  nextHealthAfterFailure,
  sanitizeIntegrationError,
  type IntegrationFailureKind,
  type IntegrationHealthKey,
  type StoredHealthRow,
  type StoredHealthState,
} from "./model";

const log = createLogger("integration-health");

export type IntegrationAttentionItem = {
  integration: IntegrationHealthKey;
  state: Exclude<StoredHealthState, "connected">;
  reconnectRequired: boolean;
  lastError: string | null;
  lastErrorAt: string | null;
  lastOkAt: string | null;
  consecutiveFailures: number;
};

type FailureOptions = {
  /** Overrides classification, e.g. when the credential is known to be missing. */
  kind?: IntegrationFailureKind;
  now?: Date;
  /** Sets the state immediately, see `HealthFailure.forceState`. */
  forceState?: "degraded" | "error";
};

type SuccessOptions = {
  now?: Date;
  /**
   * When the successful call began. A failure recorded after this instant is
   * newer than the success, so it keeps the failure state. Defaults to `now`.
   */
  startedAt?: Date;
};

/**
 * Record a successful real call. Never throws into the caller: a health write
 * must not turn a working integration call into a failure.
 */
export async function recordIntegrationSuccess(
  workspaceId: string,
  integration: IntegrationHealthKey,
  options: SuccessOptions = {},
): Promise<void> {
  try {
    const now = options.now ?? new Date();
    const startedAt = options.startedAt ?? now;
    // Passed as ISO strings: a raw Date would be stringified as Date.toString().
    const nowIso = now.toISOString();
    const startedIso = startedAt.toISOString();

    const t = integrationHealth;
    // Mirrors the `failedAfterStart` branch of `nextHealthAfterSuccess`.
    const failedAfterStart = sql`(${t.lastErrorAt} IS NOT NULL AND ${t.lastErrorAt} >= ${startedIso}::timestamptz)`;

    await db
      .insert(integrationHealth)
      .values({
        workspaceId,
        integration,
        state: "connected",
        lastOkAt: now,
        consecutiveFailures: 0,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [integrationHealth.workspaceId, integrationHealth.integration],
        set: {
          state: sql`(CASE WHEN ${failedAfterStart} THEN ${t.state} ELSE 'connected' END)`,
          consecutiveFailures: sql`(CASE WHEN ${failedAfterStart} THEN ${t.consecutiveFailures} ELSE 0 END)`,
          lastOkAt: sql`GREATEST(${t.lastOkAt}, ${nowIso}::timestamptz)`,
          updatedAt: now,
        },
      });
  } catch (error) {
    log.error({ err: error, integration }, "Failed to record integration success");
  }
}

/**
 * Record a failed real call, classifying the error unless `kind` is given.
 * The single upsert applies the same transitions as `nextHealthAfterFailure`
 * in SQL, so concurrent failures cannot lose an increment.
 */
export async function recordIntegrationFailure(
  workspaceId: string,
  integration: IntegrationHealthKey,
  error: unknown,
  options: FailureOptions = {},
): Promise<void> {
  try {
    const now = options.now ?? new Date();
    const kind = options.kind ?? classifyIntegrationError(integration, error).kind;
    const message = sanitizeIntegrationError(error);
    const insertState = nextHealthAfterFailure(null, {
      kind,
      message,
      now,
      forceState: options.forceState,
    }).state;
    // Passed as ISO strings: a raw Date would be stringified as Date.toString().
    const nowIso = now.toISOString();
    const windowStart = new Date(now.getTime() - FAILURE_WINDOW_MS).toISOString();

    const t = integrationHealth;
    // Mirrors `continuesFailureStreak`: the previous failure is inside the window.
    const continues = sql`(${t.consecutiveFailures} > 0 AND ${t.lastErrorAt} >= ${windowStart}::timestamptz)`;
    const streak = sql`(CASE WHEN ${continues} THEN ${t.consecutiveFailures} + 1 ELSE 1 END)`;
    // A new streak starts from connected; reconnect state is kept.
    const carried = sql`(CASE WHEN ${t.state} = 'needs_reconnect' THEN 'needs_reconnect' WHEN ${continues} THEN ${t.state} ELSE 'connected' END)`;
    const thresholdState = kind === "transient" ? sql`'degraded'` : sql`'error'`;
    const forced = options.forceState ? sql`${options.forceState}` : null;

    let nextState;
    if (kind === "auth") {
      nextState = sql`'needs_reconnect'`;
    } else if (forced) {
      nextState = sql`(CASE WHEN ${carried} = 'needs_reconnect' THEN ${carried} ELSE ${forced} END)`;
    } else {
      nextState = sql`(CASE WHEN ${carried} = 'needs_reconnect' THEN ${carried} WHEN ${streak} >= ${DEGRADED_FAILURE_THRESHOLD} THEN ${thresholdState} ELSE ${carried} END)`;
    }

    await db
      .insert(integrationHealth)
      .values({
        workspaceId,
        integration,
        state: insertState,
        lastErrorAt: now,
        lastError: message,
        consecutiveFailures: 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [integrationHealth.workspaceId, integrationHealth.integration],
        set: {
          state: nextState,
          consecutiveFailures: streak,
          // Mirrors `newest` in `nextHealthAfterFailure`: timestamps never go back.
          lastErrorAt: sql`GREATEST(${t.lastErrorAt}, ${nowIso}::timestamptz)`,
          lastError: sql`(CASE WHEN ${t.lastErrorAt} IS NULL OR ${nowIso}::timestamptz >= ${t.lastErrorAt} THEN ${message} ELSE ${t.lastError} END)`,
          updatedAt: now,
        },
      });
  } catch (writeError) {
    log.error({ err: writeError, integration }, "Failed to record integration failure");
  }
}

/** Remove the stored health for an integration after the user disconnects it. */
export async function clearIntegrationHealth(
  workspaceId: string,
  integration: IntegrationHealthKey,
): Promise<void> {
  try {
    await db
      .delete(integrationHealth)
      .where(
        and(
          eq(integrationHealth.workspaceId, workspaceId),
          eq(integrationHealth.integration, integration),
        ),
      );
  } catch (error) {
    log.error({ err: error, integration }, "Failed to clear integration health");
  }
}

let warnedHealthReadFailure = false;

/**
 * Stored health for every integration of a workspace, keyed by integration.
 * Fail-soft: a read error, or code deployed before the health table exists,
 * yields no stored rows (every integration then reads from its configuration)
 * instead of breaking the settings page, interview preparation and AI tools.
 */
export async function getIntegrationHealth(
  workspaceId: string,
): Promise<Partial<Record<IntegrationHealthKey, StoredHealthRow>>> {
  try {
    const rows = await db
      .select({
        integration: integrationHealth.integration,
        state: integrationHealth.state,
        lastOkAt: integrationHealth.lastOkAt,
        lastErrorAt: integrationHealth.lastErrorAt,
        lastError: integrationHealth.lastError,
        consecutiveFailures: integrationHealth.consecutiveFailures,
      })
      .from(integrationHealth)
      .where(eq(integrationHealth.workspaceId, workspaceId));

    const result: Partial<Record<IntegrationHealthKey, StoredHealthRow>> = {};
    for (const row of rows) {
      result[row.integration as IntegrationHealthKey] = {
        state: row.state as StoredHealthState,
        lastOkAt: row.lastOkAt,
        lastErrorAt: row.lastErrorAt,
        lastError: row.lastError,
        consecutiveFailures: row.consecutiveFailures,
      };
    }
    return result;
  } catch (error) {
    if (!warnedHealthReadFailure) {
      warnedHealthReadFailure = true;
      log.warn({ err: error }, "Integration health could not be read; using configuration only");
    }
    return {};
  }
}

/** Integrations that need the user's attention, most severe first. */
export async function getIntegrationAttention(
  workspaceId: string,
): Promise<IntegrationAttentionItem[]> {
  const rows = await db
    .select({
      integration: integrationHealth.integration,
      state: integrationHealth.state,
      lastOkAt: integrationHealth.lastOkAt,
      lastErrorAt: integrationHealth.lastErrorAt,
      lastError: integrationHealth.lastError,
      consecutiveFailures: integrationHealth.consecutiveFailures,
    })
    .from(integrationHealth)
    .where(
      and(
        eq(integrationHealth.workspaceId, workspaceId),
        inArray(integrationHealth.state, ["needs_reconnect", "error", "degraded"]),
      ),
    );

  const severity: Record<string, number> = { needs_reconnect: 0, error: 1, degraded: 2 };
  return rows
    .map((row) => ({
      integration: row.integration as IntegrationHealthKey,
      state: row.state as Exclude<StoredHealthState, "connected">,
      reconnectRequired: row.state === "needs_reconnect",
      lastError: row.lastError,
      lastErrorAt: row.lastErrorAt?.toISOString() ?? null,
      lastOkAt: row.lastOkAt?.toISOString() ?? null,
      consecutiveFailures: row.consecutiveFailures,
    }))
    .sort((a, b) => severity[a.state]! - severity[b.state]! || a.integration.localeCompare(b.integration));
}
