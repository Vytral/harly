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
  status: "draft" | "published" | "paused";
  triggerEvent: WorkflowEvent;
  trigger: Trigger;
  conditions: Conditions;
  actions: Action[];
  definitionVersion: number;
  approvalRequestedAt: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  publishedById: string | null;
  publishedAt: string | null;
  maxRunsPerMinute: number;
  maxExternalActionsPerMinute: number;
  circuitBreakerThreshold: number;
  circuitBreakerCooldownSeconds: number;
  circuitOpenUntil: string | null;
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
  status: "running" | "succeeded" | "failed" | "skipped" | "dead_letter" | "cancelled";
  sourceEventId: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lockedAt: string | null;
  heartbeatAt: string | null;
  deadLetteredAt: string | null;
  cancelRequestedAt: string | null;
  cancelledAt: string | null;
  durationMs: number | null;
  startStepIndex: number;
  replayOfRunId: string | null;
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
