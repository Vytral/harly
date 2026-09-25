/**
 * Client-side shape of a workflow as returned by `serializeWorkflow` (data.ts).
 * Mirrors the serializer's output exactly so the builder can consume server
 * data without a second mapping. Kept here (not in schema.ts) because it
 * carries ISO date strings — a serialization concern, not a Zod concern.
 */

import type { Action, Conditions, Trigger, WorkflowEvent } from "../schema";
import type { EditorLayout, WorkflowGraphV2 } from "../definition/schema-v2";

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
  draftRevision: number;
  contentHash: string;
  reviewHash: string | null;
  hasUnpublishedChanges: boolean;
  engineVersion: number;
  graph?: WorkflowGraphV2;
  layout?: EditorLayout;
};

export type SerializedRun = {
  id: string;
  workflowId: string;
  triggerEvent: WorkflowEvent;
  triggerPayload: unknown;
  conditionResult: unknown;
  status: "running" | "succeeded" | "failed" | "skipped" | "dead_letter" | "cancelled";
  logicalStatus: string | null;
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
  nodeId?: string;
  runId: string;
  stepIndex: number | null;
  actionType: string;
  actionInput: unknown;
  result: unknown;
  status: "running" | "waiting" | "succeeded" | "failed" | "uncertain" | "skipped" | "cancelled";
  retryable?: boolean;
  attemptCount?: number;
  errorCode?: string | null;
  startedAt: string;
  finishedAt: string | null;
};
