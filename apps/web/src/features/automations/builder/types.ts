/**
 * Client-side shape of a workflow as returned by `serializeWorkflow` (data.ts).
 * Mirrors the serializer's output exactly so the builder can consume server
 * data without a second mapping. Kept here (not in schema.ts) because it
 * carries ISO date strings — a serialization concern, not a Zod concern.
 */

import type { Action, Conditions, Trigger, WorkflowEvent } from "../schema";

export type SerializedWorkflow = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  triggerEvent: WorkflowEvent;
  trigger: Trigger;
  conditions: Conditions;
  actions: Action[];
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SerializedRun = {
  id: string;
  workflowId: string;
  triggerEvent: WorkflowEvent;
  triggerPayload: unknown;
  conditionResult: unknown;
  status: "running" | "succeeded" | "failed" | "skipped" | "dead_letter";
  sourceEventId: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lockedAt: string | null;
  heartbeatAt: string | null;
  deadLetteredAt: string | null;
  startedAt: string;
  finishedAt: string | null;
  parentRunId: string | null;
  error: string | null;
  createdAt: string;
};

export type SerializedRunStep = {
  id: string;
  runId: string;
  stepIndex: number | null;
  actionType: string;
  actionInput: unknown;
  result: unknown;
  status: "running" | "succeeded" | "failed" | "skipped";
  startedAt: string;
  finishedAt: string | null;
};
