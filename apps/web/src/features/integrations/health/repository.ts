import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db, integrationHealth } from "@harly/db";

import { createLogger } from "@/lib/logger";

import {
  DEGRADED_FAILURE_THRESHOLD,
  FAILURE_WINDOW_MS,
  classifyIntegrationError,
  nextHealthAfterFailure,
  nextHealthAfterSuccess,
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
};

/**
 * Record a successful real call. Never throws into the caller: a health write
 * must not turn a working integration call into a failure.
 */
export async function recordIntegrationSuccess(
  workspaceId: string,
  integration: IntegrationHealthKey,
  now: Date = new Date(),
): Promise<void> {
  try {
    const next = nextHealthAfterSuccess(null, now);
    await db
      .insert(integrationHealth)
      .values({
        workspaceId,
        integration,
        state: next.state,
        lastOkAt: now,
        consecutiveFailures: 0,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [integrationHealth.workspaceId, integrationHealth.integration],
        set: {
          state: "connected",
          lastOkAt: now,
          consecutiveFailures: 0,
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
    const insertState = nextHealthAfterFailure(null, { kind, message, now }).state;
    // Passed as an ISO string: a raw Date would be stringified as Date.toString().
    const windowStart = new Date(now.getTime() - FAILURE_WINDOW_MS).toISOString();

    const t = integrationHealth;
    const streak = sql`(CASE WHEN ${t.consecutiveFailures} > 0 AND ${t.lastErrorAt} >= ${windowStart}::timestamptz THEN ${t.consecutiveFailures} + 1 ELSE 1 END)`;
    const thresholdState = kind === "transient" ? "degraded" : "error";
    const nextState =
      kind === "auth"
        ? sql`'needs_reconnect'`
        : sql`(CASE WHEN ${streak} >= ${DEGRADED_FAILURE_THRESHOLD} AND ${t.state} <> 'needs_reconnect' THEN ${thresholdState} ELSE ${t.state} END)`;

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
          lastErrorAt: now,
          lastError: message,
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

/** Stored health for every integration of a workspace, keyed by integration. */
export async function getIntegrationHealth(
  workspaceId: string,
): Promise<Partial<Record<IntegrationHealthKey, StoredHealthRow>>> {
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
