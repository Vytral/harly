import "server-only";

import { checkAvailability } from "@/lib/gcal/availability";
import {
  getIntegrationStatuses,
  type IntegrationStatuses,
} from "@/features/workspaces/integrations-registry";
import { parseScheduledAt } from "@/features/interviews/shared";
import { resolveCandidateApplication } from "./application-resolution";
import type { ApplicationSearchItem } from "./application-resolution-matching";

export type MeetingProviderChoice =
  | "auto"
  | "google_meet"
  | "zoom"
  | "teams"
  | "jitsi"
  | "external";

export function chooseMeetingProvider(
  requested: MeetingProviderChoice,
  statuses: IntegrationStatuses,
  hasExplicitLocation: boolean,
): MeetingProviderChoice | "none" {
  if (requested === "external") return hasExplicitLocation ? "external" : "none";
  if (requested !== "auto") return requested;
  if (statuses.zoom.installationState === "installed" && statuses.zoom.configured) return "zoom";
  if (statuses.outlook.enabled && statuses.outlook.hasToken && statuses.outlook.encryptionReady) return "teams";
  if (statuses.gcal.enabled && statuses.gcal.hasRefreshToken && statuses.gcal.hasCredentials && statuses.gcal.encryptionReady) return "google_meet";
  if (statuses.jitsi.enabled && Boolean(statuses.jitsi.baseUrl)) return "jitsi";
  return "none";
}

function providerReady(
  provider: MeetingProviderChoice | "none",
  statuses: IntegrationStatuses,
  hasExplicitLocation: boolean,
): boolean {
  if (provider === "external") return hasExplicitLocation;
  if (provider === "zoom") return statuses.zoom.installationState === "installed" && statuses.zoom.configured;
  if (provider === "teams") return statuses.outlook.enabled && statuses.outlook.hasToken && statuses.outlook.encryptionReady;
  if (provider === "google_meet") return statuses.gcal.enabled && statuses.gcal.hasRefreshToken && statuses.gcal.hasCredentials && statuses.gcal.encryptionReady;
  if (provider === "jitsi") return statuses.jitsi.enabled && Boolean(statuses.jitsi.baseUrl);
  return false;
}

type Availability = Awaited<ReturnType<typeof checkAvailability>>;

export type InterviewPreparation =
  | {
      status: "ready" | "needs_attention";
      candidateId: string;
      application: ApplicationSearchItem;
      scheduledAt: string;
      resolvedUtc: string;
      timeZone: string | null;
      durationMins: number;
      provider: MeetingProviderChoice | "none";
      providerReady: boolean;
      availability: Availability;
      warnings: string[];
    }
  | {
      status: "ambiguous" | "not_found" | "invalid_time";
      candidateId: string;
      reason: string;
      applications?: unknown[];
    };

export async function prepareInterviewScheduling(input: {
  workspaceId: string;
  candidateId: string;
  jobQuery?: string | null;
  applicationId?: string | null;
  scheduledAt: string;
  timeZone?: string | null;
  durationMins: number;
  interviewerId?: string | null;
  meetingProvider: MeetingProviderChoice;
  location?: string | null;
}): Promise<InterviewPreparation> {
  const resolution = await resolveCandidateApplication({
    candidateId: input.candidateId,
    jobQuery: input.jobQuery,
    applicationId: input.applicationId,
  });
  if (resolution.status !== "resolved") {
    return {
      status: resolution.status,
      candidateId: input.candidateId,
      reason: resolution.status === "ambiguous" ? "application_required" : resolution.reason,
      ...(resolution.status === "ambiguous" ? { applications: resolution.applications } : {}),
    };
  }

  const when = parseScheduledAt(input.scheduledAt, input.timeZone);
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
    return { status: "invalid_time", candidateId: input.candidateId, reason: "scheduled_time_must_be_in_the_future" };
  }

  const availability = await checkAvailability({
    timeMin: when,
    timeMax: new Date(when.getTime() + input.durationMins * 60_000),
    interviewerId: input.interviewerId ?? undefined,
  });
  const statuses = await getIntegrationStatuses(input.workspaceId);
  const hasExplicitLocation = Boolean(input.location?.trim());
  const provider = chooseMeetingProvider(input.meetingProvider, statuses, hasExplicitLocation);
  const warnings: string[] = [];
  if (availability.internalConflicts.length > 0) warnings.push("The interviewer has an internal scheduling conflict.");
  if (availability.error) warnings.push(availability.error);
  if (provider === "none") {
    warnings.push(input.meetingProvider === "external" ? "An explicit external meeting link is required." : "No requested video provider is connected; the interview can still be saved without a video link.");
  } else if (!providerReady(provider, statuses, hasExplicitLocation)) {
    warnings.push(`${provider} needs to be connected or repaired before it can create a meeting.`);
  }

  return {
    status: warnings.length > 0 ? "needs_attention" : "ready",
    candidateId: input.candidateId,
    application: resolution.application,
    scheduledAt: input.scheduledAt,
    resolvedUtc: when.toISOString(),
    timeZone: input.timeZone ?? null,
    durationMins: input.durationMins,
    provider,
    providerReady: providerReady(provider, statuses, hasExplicitLocation),
    availability,
    warnings,
  };
}
