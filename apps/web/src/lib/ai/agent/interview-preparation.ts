import "server-only";

import { checkAvailability } from "@/lib/gcal/availability";
import { getIntegrationStatuses } from "@/features/workspaces/integrations-registry";
import { parseScheduledAt } from "@/features/interviews/shared";
import { resolveCandidateApplication } from "./application-resolution";
import type { ApplicationSearchItem } from "./application-resolution-matching";
import {
  chooseMeetingProvider,
  providerIsReady,
  type MeetingProviderChoice,
} from "./meeting-provider";

export type { MeetingProviderChoice } from "./meeting-provider";

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
  if (availability.gcalAvailability === "unknown") {
    warnings.push("Google Calendar could not be checked, so conflicts on that calendar are unknown.");
  }
  if (provider === "none") {
    warnings.push(input.meetingProvider === "external" ? "An explicit external meeting link is required." : "No requested video provider is connected; the interview can still be saved without a video link.");
  } else if (!providerIsReady(provider, statuses, hasExplicitLocation)) {
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
    providerReady: providerIsReady(provider, statuses, hasExplicitLocation),
    availability,
    warnings,
  };
}
