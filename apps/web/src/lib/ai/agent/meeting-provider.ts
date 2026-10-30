/**
 * Meeting-provider choice for an interview. Pure: the statuses come in as data,
 * so the selection can be tested without the server-only integration modules.
 * A provider counts only when its configuration is present and its stored
 * health is usable (`health.connected`): a Zoom or Google connection that needs
 * reconnecting, or whose credentials cannot be decrypted, is not chosen.
 */

import type { IntegrationStatuses } from "@/features/workspaces/integrations-registry";

export type MeetingProviderChoice =
  | "auto"
  | "google_meet"
  | "zoom"
  | "teams"
  | "jitsi"
  | "external";

export type MeetingProviderStatuses = Pick<
  IntegrationStatuses,
  "zoom" | "outlook" | "gcal" | "jitsi" | "health"
>;

function zoomReady(statuses: MeetingProviderStatuses): boolean {
  return (
    statuses.zoom.installationState === "installed" &&
    statuses.zoom.configured &&
    statuses.health.zoom.connected
  );
}

function teamsReady(statuses: MeetingProviderStatuses): boolean {
  return (
    statuses.outlook.enabled &&
    statuses.outlook.hasToken &&
    statuses.outlook.encryptionReady &&
    statuses.health.outlook.connected
  );
}

function googleMeetReady(statuses: MeetingProviderStatuses): boolean {
  return (
    statuses.gcal.enabled &&
    statuses.gcal.hasRefreshToken &&
    statuses.gcal.hasCredentials &&
    statuses.gcal.encryptionReady &&
    statuses.health.gcal.connected
  );
}

function jitsiReady(statuses: MeetingProviderStatuses): boolean {
  return (
    statuses.jitsi.enabled &&
    Boolean(statuses.jitsi.baseUrl) &&
    statuses.health.jitsi.connected
  );
}

export function chooseMeetingProvider(
  requested: MeetingProviderChoice,
  statuses: MeetingProviderStatuses,
  hasExplicitLocation: boolean,
): MeetingProviderChoice | "none" {
  if (requested === "external") return hasExplicitLocation ? "external" : "none";
  if (requested !== "auto") return requested;
  if (zoomReady(statuses)) return "zoom";
  if (teamsReady(statuses)) return "teams";
  if (googleMeetReady(statuses)) return "google_meet";
  if (jitsiReady(statuses)) return "jitsi";
  return "none";
}

/** Whether the chosen provider can create a meeting right now. */
export function providerIsReady(
  provider: MeetingProviderChoice | "none",
  statuses: MeetingProviderStatuses,
  hasExplicitLocation: boolean,
): boolean {
  if (provider === "external") return hasExplicitLocation;
  if (provider === "zoom") return zoomReady(statuses);
  if (provider === "teams") return teamsReady(statuses);
  if (provider === "google_meet") return googleMeetReady(statuses);
  if (provider === "jitsi") return jitsiReady(statuses);
  return false;
}
