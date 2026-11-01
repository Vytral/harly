/**
 * Lifecycle of an update request. Pure and client-safe.
 *
 *   pending -> claimed -> running -> succeeded | failed | rolled_back
 *   pending -> cancelled
 *
 * `claimed` means the host updater took the request; `running` means it has
 * started changing the installation. The updater may jump straight from
 * `claimed` to a terminal state (a stale request is refused before any change).
 */
export const UPDATE_STATUSES = [
  "pending",
  "claimed",
  "running",
  "succeeded",
  "failed",
  "rolled_back",
  "cancelled",
] as const;

export type UpdateStatus = (typeof UPDATE_STATUSES)[number];

export const ACTIVE_UPDATE_STATUSES = ["pending", "claimed", "running"] as const;

export type UpdaterReportedStatus = "running" | "succeeded" | "failed" | "rolled_back";

const NEXT: Record<UpdateStatus, readonly UpdateStatus[]> = {
  pending: ["claimed", "cancelled"],
  claimed: ["running", "succeeded", "failed", "rolled_back"],
  running: ["succeeded", "failed", "rolled_back"],
  succeeded: [],
  failed: [],
  rolled_back: [],
  cancelled: [],
};

export function isActiveUpdateStatus(status: string): boolean {
  return (ACTIVE_UPDATE_STATUSES as readonly string[]).includes(status);
}

/** Statuses a request may be in just before `to`, for a conditional UPDATE. */
export function statusesBefore(to: UpdateStatus): UpdateStatus[] {
  return UPDATE_STATUSES.filter((from) => NEXT[from].includes(to));
}

/** Same-status reports are allowed so a retried progress message is harmless. */
export function canTransition(from: UpdateStatus, to: UpdateStatus): boolean {
  return from === to ? !isTerminal(from) : NEXT[from].includes(to);
}

export function isTerminal(status: UpdateStatus): boolean {
  return NEXT[status].length === 0;
}

/** A request the updater stopped reporting on for this long is declared failed. */
export const STALE_ACTIVE_MS = 90 * 60 * 1000;
/** A request nobody claimed for this long is withdrawn. */
export const STALE_PENDING_MS = 24 * 60 * 60 * 1000;
/** The updater polls about once a minute; this is how long silence means "not running". */
export const UPDATER_ONLINE_MS = 5 * 60 * 1000;

export function isUpdaterOnline(lastSeenAt: Date | null, now: Date): boolean {
  return lastSeenAt !== null && now.getTime() - lastSeenAt.getTime() <= UPDATER_ONLINE_MS;
}

export const UPDATE_STATUS_LABEL: Record<UpdateStatus, string> = {
  pending: "Waiting for the updater",
  claimed: "Starting",
  running: "Updating",
  succeeded: "Updated",
  failed: "Failed",
  rolled_back: "Rolled back",
  cancelled: "Cancelled",
};
