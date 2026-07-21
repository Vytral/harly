/**
 * Builder catalog — client-safe display metadata for the workflow engine's
 * trigger events, condition operators, field kinds, and action types.
 *
 * This is presentation layer only: the source of truth for *what is valid* is
 `./schema` (Zod) and `./registry` (handlers). This module only describes how
 * each value *renders* in the builder — label, blurb, icon, and which config
 * fields an action editor shows.
 *
 * Kept client-safe (no server-only imports) so it can be imported by client
 * components. The action-type list is mirrored from ACTION_REGISTRY; if a type
 * has no handler registered server-side, `available: false` hides it in the
 * picker so a user can never build a workflow that won't run.
 */

import {
  ChatCircleDotsIcon,
  CheckCircleIcon,
  EnvelopeSimpleDuotoneIcon,
  GearSixIcon,
  KeyDuotoneIcon,
  LightningIcon,
  MagicWandDuotoneIcon,
  PaperPlaneDuotoneIcon,
  PencilIcon,
  TrashIcon,
  WebhooksDuotoneIcon,
} from "@/components/ui/icons/phosphor";

import type { ActionType, Operator, WorkflowEvent } from "../schema";

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

export type TriggerMeta = {
  event: WorkflowEvent;
  label: string;
  blurb: string;
  /** lucide-style emoji-free glyph category, mapped to an icon in the picker */
  tone: "apply" | "stage" | "outcome" | "candidate" | "interview" | "job";
};

export const TRIGGER_CATALOG: TriggerMeta[] = [
  {
    event: "application.created",
    label: "Candidate applies",
    blurb: "A new application is submitted to a job.",
    tone: "apply",
  },
  {
    event: "application.stage_changed",
    label: "Stage changes",
    blurb: "An application moves between pipeline stages.",
    tone: "stage",
  },
  {
    event: "application.hired",
    label: "Candidate hired",
    blurb: "An application is marked hired.",
    tone: "outcome",
  },
  {
    event: "application.rejected",
    label: "Candidate rejected",
    blurb: "An application is rejected.",
    tone: "outcome",
  },
  {
    event: "candidate.created",
    label: "Candidate added",
    blurb: "A new candidate record is created.",
    tone: "candidate",
  },
  {
    event: "candidate.updated",
    label: "Candidate updated",
    blurb: "A candidate's profile fields change.",
    tone: "candidate",
  },
  {
    event: "interview.scheduled",
    label: "Interview scheduled",
    blurb: "An interview is booked with a candidate.",
    tone: "interview",
  },
  {
    event: "interview.completed",
    label: "Interview completed",
    blurb: "An interview is marked complete.",
    tone: "interview",
  },
  {
    event: "job.published",
    label: "Job published",
    blurb: "A job goes live on the career page.",
    tone: "job",
  },
];

export function triggerMeta(event: WorkflowEvent): TriggerMeta {
  return TRIGGER_CATALOG.find((t) => t.event === event) ?? {
    event,
    label: event,
    blurb: "",
    tone: "apply",
  };
}

// ---------------------------------------------------------------------------
// Condition operators + field kinds
// ---------------------------------------------------------------------------

export type OperatorMeta = {
  op: Operator;
  label: string;
  /** Whether the right-hand value is collected from the user. */
  wantsValue: boolean;
  /** Hint for the value input type. */
  valueKind?: "text" | "number" | "list";
};

export const OPERATOR_CATALOG: OperatorMeta[] = [
  { op: "eq", label: "equals", wantsValue: true, valueKind: "text" },
  { op: "ne", label: "does not equal", wantsValue: true, valueKind: "text" },
  { op: "gt", label: "is greater than", wantsValue: true, valueKind: "number" },
  { op: "gte", label: "is at least", wantsValue: true, valueKind: "number" },
  { op: "lt", label: "is less than", wantsValue: true, valueKind: "number" },
  { op: "lte", label: "is at most", wantsValue: true, valueKind: "number" },
  { op: "in", label: "is any of", wantsValue: true, valueKind: "list" },
  { op: "not_in", label: "is none of", wantsValue: true, valueKind: "list" },
  { op: "includes", label: "includes", wantsValue: true, valueKind: "text" },
  { op: "starts_with", label: "starts with", wantsValue: true, valueKind: "text" },
  { op: "ends_with", label: "ends with", wantsValue: true, valueKind: "text" },
  { op: "contains", label: "contains", wantsValue: true, valueKind: "text" },
  { op: "is_set", label: "is set", wantsValue: false },
  { op: "is_empty", label: "is empty", wantsValue: false },
  { op: "match_any", label: "matches any of", wantsValue: true, valueKind: "list" },
  { op: "regex", label: "matches regex", wantsValue: true, valueKind: "text" },
];

export function operatorMeta(op: Operator): OperatorMeta {
  return OPERATOR_CATALOG.find((o) => o.op === op) ?? OPERATOR_CATALOG[0]!;
}

export type FieldKindMeta = {
  kind: "candidate" | "application" | "job" | "ai" | "trigger" | "literal";
  label: string;
  blurb: string;
  /** Common paths offered as quick picks in the path input. */
  paths: string[];
};

export const FIELD_KIND_CATALOG: FieldKindMeta[] = [
  {
    kind: "candidate",
    label: "Candidate",
    blurb: "Profile fields on the candidate.",
    paths: ["firstName", "lastName", "email", "location", "source", "headline"],
  },
  {
    kind: "application",
    label: "Application",
    blurb: "Fields on the application record.",
    paths: ["status", "stage", "jobId", "source"],
  },
  {
    kind: "job",
    label: "Job",
    blurb: "Fields on the job the application is for.",
    paths: ["title", "department", "location", "employmentType", "workplaceType", "seniority"],
  },
  {
    kind: "ai",
    label: "AI insight",
    blurb: "The latest AI score / summary for the candidate.",
    paths: ["score", "recommendation", "summary", "tags"],
  },
  {
    kind: "trigger",
    label: "Trigger payload",
    blurb: "A raw field from the event payload itself.",
    paths: ["jobId", "stageId", "candidateId", "applicationId"],
  },
  {
    kind: "literal",
    label: "Literal value",
    blurb: "A constant to compare against (rarely needed).",
    paths: [],
  },
];

export function fieldKindMeta(kind: FieldKindMeta["kind"]): FieldKindMeta {
  return FIELD_KIND_CATALOG.find((f) => f.kind === kind) ?? FIELD_KIND_CATALOG[0]!;
}

// ---------------------------------------------------------------------------
// Actions — display + config-field spec
// ---------------------------------------------------------------------------

/**
 * Describes one config field an action editor renders. `key` matches the key
 * in the action's `config` object validated by the registry's Zod schema. The
 * builder writes plain strings into config; the registry parses/coerces.
 */
export type ConfigField =
  | { key: string; label: string; kind: "text"; placeholder?: string; required?: boolean; maxLength?: number }
  | { key: string; label: string; kind: "textarea"; placeholder?: string; required?: boolean; maxLength?: number }
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[]; required?: boolean; placeholder?: string }
  | { key: string; label: string; kind: "stage"; required?: boolean }
  | { key: string; label: string; kind: "owner"; }
  | { key: string; label: string; kind: "secret-refs"; placeholder?: string }
  | { key: string; label: string; kind: "keyval"; placeholder?: string };

export type ActionMeta = {
  type: ActionType;
  label: string;
  blurb: string;
  group: "Pipeline" | "Candidate" | "Communication" | "Task" | "External";
  icon: typeof LightningIcon;
  /** Config fields the editor renders, in order. */
  config: ConfigField[];
  /** Ship-ready in v1 (has a registered handler). False hides from picker. */
  available: boolean;
};

export const ACTION_CATALOG: ActionMeta[] = [
  {
    type: "move_stage",
    label: "Move to stage",
    blurb: "Advance the application to a pipeline stage.",
    group: "Pipeline",
    icon: GearSixIcon,
    available: true,
    config: [{ key: "toStageName", label: "Target stage", kind: "stage", required: true }],
  },
  {
    type: "set_status",
    label: "Set status",
    blurb: "Set the application status (hired, rejected, …).",
    group: "Pipeline",
    icon: CheckCircleIcon,
    available: true,
    config: [
      {
        key: "status",
        label: "Status",
        kind: "select",
        required: true,
        options: [
          { value: "active", label: "Active" },
          { value: "hired", label: "Hired" },
          { value: "rejected", label: "Rejected" },
          { value: "withdrawn", label: "Withdrawn" },
        ],
      },
    ],
  },
  {
    type: "add_note",
    label: "Add note",
    blurb: "Leave a note on the candidate, authored by the workflow.",
    group: "Candidate",
    icon: PencilIcon,
    available: true,
    config: [{ key: "body", label: "Note", kind: "textarea", required: true, maxLength: 2000, placeholder: "What should the note say?" }],
  },
  {
    type: "add_tag",
    label: "Add tag",
    blurb: "Tag the candidate.",
    group: "Candidate",
    icon: LightningIcon,
    available: true,
    config: [{ key: "label", label: "Tag", kind: "text", required: true, maxLength: 50, placeholder: "e.g. vip" }],
  },
  {
    type: "remove_tag",
    label: "Remove tag",
    blurb: "Remove a tag from the candidate.",
    group: "Candidate",
    icon: TrashIcon,
    available: true,
    config: [{ key: "label", label: "Tag", kind: "text", required: true, maxLength: 50, placeholder: "e.g. vip" }],
  },
  {
    type: "create_task",
    label: "Create task",
    blurb: "Assign a follow-up task to a teammate.",
    group: "Task",
    icon: CheckCircleIcon,
    available: true,
    config: [
      { key: "title", label: "Task title", kind: "text", required: true, maxLength: 200, placeholder: "e.g. Phone screen the candidate" },
      { key: "ownerId", label: "Assignee", kind: "owner" },
      {
        key: "priority",
        label: "Priority",
        kind: "select",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
          { value: "urgent", label: "Urgent" },
        ],
      },
      { key: "dueDate", label: "Due date (ISO)", kind: "text", placeholder: "yyyy-mm-dd" },
    ],
  },
  {
    type: "send_slack",
    label: "Send chat message",
    blurb: "Post a message to your Slack / Discord channel.",
    group: "Communication",
    icon: ChatCircleDotsIcon,
    available: true,
    config: [{ key: "message", label: "Message", kind: "textarea", required: true, maxLength: 2000, placeholder: "New application received for {{job.title}}" }],
  },
  {
    type: "send_email",
    label: "Send email",
    blurb: "Email the candidate (outbox). v1: wired soon.",
    group: "Communication",
    icon: EnvelopeSimpleDuotoneIcon,
    available: true,
    config: [
      { key: "toEmail", label: "To email", kind: "text", required: true, placeholder: "candidate@example.com" },
      { key: "subject", label: "Subject", kind: "text", required: true, maxLength: 200 },
      { key: "body", label: "Body", kind: "textarea", required: true, maxLength: 10000 },
    ],
  },
  {
    type: "http_request",
    label: "HTTP request",
    blurb: "Call an external URL. Reference secrets as {{secrets.NAME}}.",
    group: "External",
    icon: WebhooksDuotoneIcon,
    available: true,
    config: [
      { key: "url", label: "URL", kind: "text", required: true, placeholder: "https://api.example.com/hook" },
      {
        key: "method",
        label: "Method",
        kind: "select",
        options: ["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({ value: m, label: m })),
      },
      { key: "headers", label: "Headers (one per line, Key: Value)", kind: "keyval", placeholder: "Authorization: Bearer {{secrets.TOKEN}}" },
      { key: "body", label: "Body", kind: "textarea", placeholder: "{ \"event\": \"{{trigger.event}}\" }" },
      { key: "secretRefs", label: "Secret names referenced", kind: "secret-refs", placeholder: "TOKEN, API_KEY" },
    ],
  },
  // Catalog entries for not-yet-registered types (hidden from picker, but
  // documented so the NL preview + runs timeline can still label them).
  { type: "send_telegram", label: "Send Telegram", blurb: "", group: "Communication", icon: PaperPlaneDuotoneIcon, available: false, config: [] },
  { type: "send_discord", label: "Send Discord", blurb: "", group: "Communication", icon: ChatCircleDotsIcon, available: false, config: [] },
  { type: "schedule_interview", label: "Schedule interview", blurb: "", group: "Task", icon: MagicWandDuotoneIcon, available: false, config: [] },
  { type: "create_offer", label: "Create offer", blurb: "", group: "Task", icon: KeyDuotoneIcon, available: false, config: [] },
  { type: "send_offer", label: "Send offer", blurb: "", group: "Communication", icon: PaperPlaneDuotoneIcon, available: false, config: [] },
  { type: "ai_score", label: "AI: score", blurb: "", group: "External", icon: MagicWandDuotoneIcon, available: false, config: [] },
  { type: "ai_summarize", label: "AI: summarize", blurb: "", group: "External", icon: MagicWandDuotoneIcon, available: false, config: [] },
  { type: "ai_decide", label: "AI: decide", blurb: "", group: "External", icon: MagicWandDuotoneIcon, available: false, config: [] },
];

export function actionMeta(type: ActionType): ActionMeta | undefined {
  return ACTION_CATALOG.find((a) => a.type === type);
}

/** Actions a user is allowed to pick in the builder (registered + available). */
export function pickableActions(): ActionMeta[] {
  return ACTION_CATALOG.filter((a) => a.available);
}
