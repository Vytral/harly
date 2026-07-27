import "server-only";

import { z } from "zod";

const entitySchema = z.record(z.string(), z.unknown());
const payloadSchemas = {
  "application.created": z.object({ application: entitySchema }).passthrough(),
  "application.stage_changed": z
    .object({
      application: entitySchema,
      fromStageId: z.string().nullable().optional(),
      toStageId: z.string().optional(),
      status: z.string().optional(),
    })
    .passthrough(),
  "application.hired": z.object({ application: entitySchema }).passthrough(),
  "application.rejected": z.object({ application: entitySchema }).passthrough(),
  "candidate.created": z.object({ candidate: entitySchema }).passthrough(),
  "candidate.updated": z.object({ candidate: entitySchema }).passthrough(),
  "interview.scheduled": z.object({ interview: entitySchema }).passthrough(),
  "interview.rescheduled": z.object({ interview: entitySchema }).passthrough(),
  "interview.completed": z.object({ interview: entitySchema }).passthrough(),
  "interview.canceled": z.object({ interview: entitySchema }).passthrough(),
  "job.published": z.object({ job: entitySchema }).passthrough(),
  "job.updated": z.object({ job: entitySchema }).passthrough(),
  "job.closed": z.object({ job: entitySchema }).passthrough(),
  "task.created": z.object({ task: entitySchema }).passthrough(),
  "task.updated": z.object({ task: entitySchema }).passthrough(),
  "task.deleted": z.object({ task: entitySchema }).passthrough(),
  "mail.received": z.object({ message: entitySchema }).passthrough(),
} as const;

export const DOMAIN_EVENTS = {
  APPLICATION_CREATED: "application.created",
  APPLICATION_STAGE_CHANGED: "application.stage_changed",
  APPLICATION_HIRED: "application.hired",
  APPLICATION_REJECTED: "application.rejected",
  CANDIDATE_CREATED: "candidate.created",
  CANDIDATE_UPDATED: "candidate.updated",
  INTERVIEW_SCHEDULED: "interview.scheduled",
  INTERVIEW_CANCELED: "interview.canceled",
  INTERVIEW_COMPLETED: "interview.completed",
  INTERVIEW_RESCHEDULED: "interview.rescheduled",
  JOB_PUBLISHED: "job.published",
  JOB_UPDATED: "job.updated",
  JOB_CLOSED: "job.closed",
  TASK_CREATED: "task.created",
  TASK_UPDATED: "task.updated",
  TASK_DELETED: "task.deleted",
  MAIL_RECEIVED: "mail.received",
} as const;

export const REALTIME_EVENTS = {
  DOMAIN_INVALIDATE: "domain.invalidate",
  NOTIFICATIONS_INVALIDATE: "notifications.invalidate",
  INBOX_INVALIDATE: "inbox.invalidate",
  DASHBOARD_INVALIDATE: "dashboard.invalidate",
} as const;

export type DomainEventName =
  (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];
export type RealtimeEventName =
  (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

export const EVENT_REGISTRY: Record<
  DomainEventName,
  {
    eventVersion: number;
    schemaVersion: number;
    durable: boolean;
    realtime: boolean;
    payload: z.ZodType<Record<string, unknown>>;
  }
> = Object.fromEntries(
  Object.values(DOMAIN_EVENTS).map((name) => [
    name,
    {
      eventVersion: 1,
      schemaVersion: 1,
      durable: true,
      realtime: true,
      payload: payloadSchemas[name],
    },
  ]),
) as unknown as Record<DomainEventName, (typeof EVENT_REGISTRY)[DomainEventName]>;

export function isDomainEventName(value: string): value is DomainEventName {
  return Object.values(DOMAIN_EVENTS).includes(value as DomainEventName);
}

export function assertDomainEventPayload(
  name: DomainEventName,
  payload: unknown,
): Record<string, unknown> {
  return EVENT_REGISTRY[name].payload.parse(payload);
}
