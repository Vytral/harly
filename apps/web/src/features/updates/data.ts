import "server-only";

import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import {
  db,
  instanceUpdateState,
  updateRequests,
  workspaceSettings,
  workspaceUpdateSettings,
  type InstanceUpdateState,
  type UpdateRequest,
} from "@harly/db";

import { logAuditEvent } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";

import {
  DEFAULT_RELEASE_MANIFEST_URL,
  parseReleaseManifest,
  releaseNotesApiUrl,
  releaseNotesUrl,
  summarizeReleaseNotes,
} from "./release-channel";
import { classifyUpdate, type AutoUpdateLevel } from "./release-version";
import {
  STALE_ACTIVE_MS,
  STALE_PENDING_MS,
  isUpdaterOnline,
} from "./update-request-state";
import {
  DEFAULT_UPDATE_WINDOW,
  isValidTimezone,
  nextUpdateWindowStart,
  type UpdateWindow,
} from "./update-window";

const log = createLogger("updates");

/** How long a successful look at the release channel is trusted. */
const CHECK_TTL_MS = 6 * 60 * 60 * 1000;
/** A failed check is retried sooner, but not on every updater poll. */
const CHECK_RETRY_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;

export function currentVersion(): string {
  return process.env.HARLY_VERSION?.trim() || "0.1.0-dev";
}

/** Operators on air-gapped hosts can switch the outbound check off entirely. */
export function isUpdateCheckDisabled(): boolean {
  return /^(1|true|off|disabled)$/i.test(process.env.HARLY_DISABLE_UPDATE_CHECK ?? "");
}

export async function getUpdateState(): Promise<InstanceUpdateState | null> {
  const [row] = await db
    .select()
    .from(instanceUpdateState)
    .where(eq(instanceUpdateState.id, 1))
    .limit(1);
  return row ?? null;
}

/** Records that the host updater just polled. Never throws into the caller's flow. */
export async function recordUpdaterHeartbeat(updaterVersion: string | null) {
  await db
    .insert(instanceUpdateState)
    .values({ id: 1, updaterLastSeenAt: new Date(), updaterVersion })
    .onConflictDoUpdate({
      target: instanceUpdateState.id,
      set: { updaterLastSeenAt: new Date(), updaterVersion, updatedAt: new Date() },
    });
}

async function fetchJson(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "application/json", ...headers },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as unknown;
}

/**
 * Reads the stable release channel (the manifest the CLI reads) and caches the
 * answer in the database, so the page, the updater's polls and every replica
 * share one lookup instead of each hitting GitHub.
 */
export async function refreshLatestRelease(
  options: { force?: boolean } = {},
): Promise<InstanceUpdateState | null> {
  const state = await getUpdateState();
  if (isUpdateCheckDisabled()) return state;

  const now = Date.now();
  const checkedAt = state?.latestCheckedAt?.getTime() ?? 0;
  const ttl = state?.latestCheckError ? CHECK_RETRY_MS : CHECK_TTL_MS;
  if (!options.force && now - checkedAt < ttl) return state;
  // Even a forced check is rate-limited, so a stuck button cannot hammer GitHub.
  if (options.force && now - checkedAt < 15_000) return state;

  const url = process.env.HARLY_RELEASE_MANIFEST_URL?.trim() || DEFAULT_RELEASE_MANIFEST_URL;
  try {
    const manifest = parseReleaseManifest(await fetchJson(url));
    if (!manifest) throw new Error("The release manifest is not valid.");

    let summary: string | null = state?.latestNotesSummary ?? null;
    if (manifest.version !== state?.latestVersion) {
      summary = null;
      try {
        const release = (await fetchJson(releaseNotesApiUrl(manifest.version))) as {
          body?: string;
        };
        summary = summarizeReleaseNotes(release.body);
      } catch {
        // Notes are a convenience; the link below still works.
      }
    }

    const values = {
      latestVersion: manifest.version,
      latestNotesUrl: releaseNotesUrl(manifest.version),
      latestNotesSummary: summary,
      latestCheckedAt: new Date(),
      latestCheckError: null,
    };
    await db
      .insert(instanceUpdateState)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({
        target: instanceUpdateState.id,
        set: { ...values, updatedAt: new Date() },
      });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reach the release channel.";
    log.warn({ message }, "release channel check failed");
    await db
      .insert(instanceUpdateState)
      .values({ id: 1, latestCheckedAt: new Date(), latestCheckError: message.slice(0, 200) })
      .onConflictDoUpdate({
        target: instanceUpdateState.id,
        set: {
          latestCheckedAt: new Date(),
          latestCheckError: message.slice(0, 200),
          updatedAt: new Date(),
        },
      });
  }
  return getUpdateState();
}

async function finish(
  request: UpdateRequest,
  status: "succeeded" | "failed" | "cancelled",
  message: string,
): Promise<void> {
  const [updated] = await db
    .update(updateRequests)
    .set({ status, message, finishedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(updateRequests.id, request.id),
        eq(updateRequests.status, request.status),
      ),
    )
    .returning({ id: updateRequests.id });
  if (!updated) return;
  await logAuditEvent({
    workspaceId: request.organizationId,
    action: `update.${status === "cancelled" ? "expired" : status}`,
    resourceType: "update_request",
    resourceId: request.id,
    severity: status === "failed" ? "warning" : "info",
    metadata: { targetVersion: request.targetVersion, message },
  });
}

/**
 * Housekeeping that makes the request table self-healing:
 * - an active request whose target is already the running version succeeded,
 *   even if the updater could not report it (the app restarts mid-update);
 * - an active request the updater stopped reporting on has failed;
 * - a request nobody claimed for a day is withdrawn.
 */
export async function reconcileUpdateRequests(now = new Date()): Promise<void> {
  const active = await db
    .select()
    .from(updateRequests)
    .where(inArray(updateRequests.status, ["pending", "claimed", "running"]));
  const running = currentVersion();
  for (const request of active) {
    if (request.status !== "pending" && request.targetVersion === running) {
      await finish(request, "succeeded", `Harly is now running ${running}.`);
    } else if (
      request.status !== "pending" &&
      now.getTime() - request.updatedAt.getTime() > STALE_ACTIVE_MS
    ) {
      await finish(
        request,
        "failed",
        "The updater stopped reporting. Check `harly updater status` on the host.",
      );
    } else if (
      request.status === "pending" &&
      now.getTime() - request.createdAt.getTime() > STALE_PENDING_MS
    ) {
      await finish(request, "cancelled", "No updater picked this request up within a day.");
    }
  }
}

export type AutoUpdateSettings = {
  enabled: boolean;
  level: AutoUpdateLevel;
  window: UpdateWindow;
  /** False until an owner saves the form once; the values shown are defaults. */
  saved: boolean;
};

export async function getAutoUpdateSettings(
  organizationId: string,
): Promise<AutoUpdateSettings> {
  const [[row], [workspace]] = await Promise.all([
    db
      .select()
      .from(workspaceUpdateSettings)
      .where(eq(workspaceUpdateSettings.organizationId, organizationId))
      .limit(1),
    db
      .select({ timezone: workspaceSettings.timezone })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, organizationId))
      .limit(1),
  ]);
  if (row) {
    return {
      enabled: row.autoUpdateEnabled,
      level: row.autoUpdateLevel === "minor" ? "minor" : "patch",
      window: {
        days: [...row.windowDays].sort((a, b) => a - b),
        startHour: row.windowStartHour,
        endHour: row.windowEndHour,
        timezone: row.windowTimezone,
      },
      saved: true,
    };
  }
  // Default to the workspace's own time zone, so "02:00" means 02:00 for them.
  const timezone =
    workspace?.timezone && isValidTimezone(workspace.timezone) ? workspace.timezone : "UTC";
  return {
    enabled: false,
    level: "patch",
    window: { ...DEFAULT_UPDATE_WINDOW, timezone },
    saved: false,
  };
}

export type UpdateOverview = {
  currentVersion: string;
  latestVersion: string | null;
  updateKind: "patch" | "minor" | "major" | null;
  notesUrl: string | null;
  notesSummary: string | null;
  lastCheckedAt: Date | null;
  checkError: string | null;
  checkDisabled: boolean;
  updaterOnline: boolean;
  updaterLastSeenAt: Date | null;
  updaterVersion: string | null;
  active: UpdateRequest | null;
  history: UpdateRequest[];
  settings: AutoUpdateSettings;
  nextWindowAt: Date | null;
};

export async function getUpdateOverview(
  organizationId: string,
  options: { refresh?: boolean } = {},
): Promise<UpdateOverview> {
  await reconcileUpdateRequests();
  const state = options.refresh === false ? await getUpdateState() : await refreshLatestRelease();
  const [settings, requests] = await Promise.all([
    getAutoUpdateSettings(organizationId),
    db
      .select()
      .from(updateRequests)
      .where(eq(updateRequests.organizationId, organizationId))
      .orderBy(desc(updateRequests.createdAt))
      .limit(6),
  ]);
  const now = new Date();
  const running = currentVersion();
  const latest = state?.latestVersion ?? null;
  const active =
    requests.find((request) => ["pending", "claimed", "running"].includes(request.status)) ??
    null;

  return {
    currentVersion: running,
    latestVersion: latest,
    updateKind: latest ? classifyUpdate(running, latest) : null,
    notesUrl: state?.latestNotesUrl ?? null,
    notesSummary: state?.latestNotesSummary ?? null,
    lastCheckedAt: state?.latestCheckedAt ?? null,
    checkError: state?.latestCheckError ?? null,
    checkDisabled: isUpdateCheckDisabled(),
    updaterOnline: isUpdaterOnline(state?.updaterLastSeenAt ?? null, now),
    updaterLastSeenAt: state?.updaterLastSeenAt ?? null,
    updaterVersion: state?.updaterVersion ?? null,
    active,
    history: requests.filter((request) => request.id !== active?.id).slice(0, 5),
    settings,
    nextWindowAt: settings.enabled ? nextUpdateWindowStart(now, settings.window) : null,
  };
}

/** True when a request for this exact version already ended badly recently. */
export async function hasRecentFailureFor(targetVersion: string): Promise<boolean> {
  const [row] = await db
    .select({ id: updateRequests.id })
    .from(updateRequests)
    .where(
      and(
        eq(updateRequests.targetVersion, targetVersion),
        inArray(updateRequests.status, ["failed", "rolled_back"]),
        gt(updateRequests.createdAt, sql`now() - interval '7 days'`),
      ),
    )
    .limit(1);
  return Boolean(row);
}
