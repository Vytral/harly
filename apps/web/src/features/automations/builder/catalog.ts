/**
 * Builder catalog — client-safe display metadata for the workflow engine's
 * trigger events, condition operators, field kinds, and action types.
 *
 * This is presentation layer only: the source of truth for *what is valid* is
 * `./schema` (Zod) and `./registry` (handlers). This module only describes how
 * each value *renders* in the builder — label, blurb, icon, and which config
 * fields an action editor shows.
 *
 * Kept client-safe (no server-only imports) so it can be imported by client
 * components. The action-type list is mirrored from ACTION_REGISTRY; if a type
 * has no handler registered server-side, `available: false` hides it in the
 * picker so a user can never build a workflow that won't run.
 *
 * Every helper takes the `labels.automations` translator. Keys are prefixed
 * with `catalog.` here, so the same translator can serve every builder helper.
 */

import type { useTranslations } from "next-intl";

import {
  ChatCircleDotsIcon,
  CalendarBlankIcon,
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

/** Translator for the `labels.automations` namespace. */
export type BuilderT = ReturnType<typeof useTranslations>;

/** Turns `application.created`, `move_stage` or `google_meet` into camelCase. */
export function camelCase(value: string): string {
  return value.replace(/[._-]([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

export type TriggerMeta = {
  event: WorkflowEvent;
  label: string;
  blurb: string;
  /** Short phrase used inside sentences, for example "a candidate applies". */
  phrase: string;
  /** lucide-style emoji-free glyph category, mapped to an icon in the picker */
  tone: "apply" | "stage" | "outcome" | "candidate" | "interview" | "job";
};

const TRIGGER_ROWS: Array<{ event: WorkflowEvent; tone: TriggerMeta["tone"] }> = [
  { event: "application.created", tone: "apply" },
  { event: "application.stage_changed", tone: "stage" },
  { event: "application.status_changed", tone: "outcome" },
  { event: "application.hired", tone: "outcome" },
  { event: "application.rejected", tone: "outcome" },
  { event: "candidate.created", tone: "candidate" },
  { event: "candidate.updated", tone: "candidate" },
  { event: "interview.scheduled", tone: "interview" },
  { event: "interview.rescheduled", tone: "interview" },
  { event: "interview.completed", tone: "interview" },
  { event: "interview.canceled", tone: "interview" },
  { event: "task.completed", tone: "outcome" },
  { event: "job.published", tone: "job" },
  { event: "document.signature_sent", tone: "outcome" },
  { event: "document.signature_changed", tone: "outcome" },
  { event: "document.signature_voided", tone: "outcome" },
  { event: "evaluation.completed", tone: "outcome" },
  { event: "webhook.received", tone: "job" },
];

export function triggerMeta(event: WorkflowEvent, t: BuilderT): TriggerMeta {
  const row = TRIGGER_ROWS.find((entry) => entry.event === event);
  if (!row) return { event, label: event, blurb: "", phrase: event, tone: "apply" };
  const key = `catalog.triggers.${camelCase(event)}`;
  return {
    event,
    tone: row.tone,
    label: t(`${key}.label`),
    blurb: t(`${key}.blurb`),
    phrase: t(`${key}.phrase`),
  };
}

/** Every trigger in picker order, with labels resolved. */
export function triggerCatalog(t: BuilderT): TriggerMeta[] {
  return TRIGGER_ROWS.map((row) => triggerMeta(row.event, t));
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

const OPERATOR_ROWS: Array<Omit<OperatorMeta, "label">> = [
  { op: "eq", wantsValue: true, valueKind: "text" },
  { op: "ne", wantsValue: true, valueKind: "text" },
  { op: "gt", wantsValue: true, valueKind: "number" },
  { op: "gte", wantsValue: true, valueKind: "number" },
  { op: "lt", wantsValue: true, valueKind: "number" },
  { op: "lte", wantsValue: true, valueKind: "number" },
  { op: "in", wantsValue: true, valueKind: "list" },
  { op: "not_in", wantsValue: true, valueKind: "list" },
  { op: "includes", wantsValue: true, valueKind: "text" },
  { op: "starts_with", wantsValue: true, valueKind: "text" },
  { op: "ends_with", wantsValue: true, valueKind: "text" },
  { op: "contains", wantsValue: true, valueKind: "text" },
  { op: "is_set", wantsValue: false },
  { op: "is_empty", wantsValue: false },
  { op: "match_any", wantsValue: true, valueKind: "list" },
  { op: "regex", wantsValue: true, valueKind: "text" },
];

/** Operators shown in the recruiter builder. Regex stays in the engine only. */
export const RECRUITER_OPERATORS: Operator[] = OPERATOR_ROWS
  .filter((entry) => entry.op !== "regex")
  .map((entry) => entry.op);

export function operatorMeta(op: Operator, t: BuilderT): OperatorMeta {
  const row = OPERATOR_ROWS.find((entry) => entry.op === op) ?? OPERATOR_ROWS[0]!;
  return { ...row, label: t(`catalog.operators.${camelCase(row.op)}`) };
}

export type FieldKindMeta = {
  kind: "candidate" | "application" | "job" | "ai" | "trigger" | "literal";
  label: string;
  blurb: string;
  /** Common paths offered as quick picks in the path input. */
  paths: string[];
};

const FIELD_KIND_ROWS: Array<{ kind: FieldKindMeta["kind"]; paths: string[] }> = [
  { kind: "candidate", paths: ["firstName", "lastName", "email", "location", "source", "headline"] },
  { kind: "application", paths: ["status", "stage", "jobId", "source"] },
  { kind: "job", paths: ["title", "department", "location", "employmentType", "workplaceType", "seniority"] },
  { kind: "ai", paths: ["score", "recommendation", "summary", "tags"] },
  { kind: "trigger", paths: ["jobId", "toStageId", "toStageName", "candidateId", "applicationId", "interview.id"] },
  { kind: "literal", paths: [] },
];

export function fieldKindMeta(kind: FieldKindMeta["kind"], t: BuilderT): FieldKindMeta {
  const row = FIELD_KIND_ROWS.find((entry) => entry.kind === kind) ?? FIELD_KIND_ROWS[0]!;
  return {
    kind: row.kind,
    paths: row.paths,
    label: t(`catalog.fieldKinds.${row.kind}.label`),
    blurb: t(`catalog.fieldKinds.${row.kind}.blurb`),
  };
}

/** All field kinds in picker order, with labels resolved. */
export function fieldKindCatalog(t: BuilderT): FieldKindMeta[] {
  return FIELD_KIND_ROWS.map((row) => fieldKindMeta(row.kind, t));
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
  | { key: string; label: string; kind: "datetime"; required?: boolean }
  | { key: string; label: string; kind: "textarea"; placeholder?: string; required?: boolean; maxLength?: number }
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[]; required?: boolean; placeholder?: string }
  | { key: string; label: string; kind: "stage"; required?: boolean }
  | { key: string; label: string; kind: "owner"; }
  | { key: string; label: string; kind: "email-template"; placeholder?: string }
  | { key: string; label: string; kind: "document-template"; placeholder?: string; required?: boolean }
  | { key: string; label: string; kind: "document"; required?: boolean; placeholder?: string; maxLength?: number }
  | { key: string; label: string; kind: "document-attachments"; required?: boolean }
  | { key: string; label: string; kind: "document-request"; required?: boolean; placeholder?: string; maxLength?: number }
  | { key: string; label: string; kind: "interview"; required?: boolean; placeholder?: string; maxLength?: number }
  | { key: string; label: string; kind: "due-offset"; placeholder?: string }
  | { key: string; label: string; kind: "tag"; placeholder?: string; required?: boolean; maxLength?: number }
  | { key: string; label: string; kind: "secret-refs"; placeholder?: string }
  | { key: string; label: string; kind: "keyval"; placeholder?: string }
  | { key: string; label: string; kind: "document-list"; required?: boolean }
  | { key: string; label: string; kind: "recipient-list" };

export type ActionMeta = {
  type: ActionType;
  label: string;
  blurb: string;
  group: "Pipeline" | "Candidate" | "Communication" | "Task" | "Meetings" | "Documents" | "External";
  /** Translated group name for headings. */
  groupLabel: string;
  icon: typeof LightningIcon;
  /** Config fields the editor renders, in order. */
  config: ConfigField[];
  /** Available in the v2 runtime (has a registered handler). False hides from picker. */
  available: boolean;
};

/** Serializable subset of the server tool manifest consumed by the editor. */
export type SafeAutomationToolManifest = {
  type: ActionType;
  version: number;
};

export type PickableActionMeta = ActionMeta & { toolVersion: number };

type ConfigRow = {
  key: string;
  kind: ConfigField["kind"];
  required?: boolean;
  maxLength?: number;
  /**
   * `true` resolves a translated placeholder. A string is a literal example
   * (usually template syntax or sample data) that is shown as-is.
   */
  placeholder?: true | string;
  /** Option values. `literal` keeps the value itself as the label (HTTP verbs). */
  options?: Array<{ value: string; literal?: true }>;
};

type ActionRow = {
  type: ActionType;
  group: ActionMeta["group"];
  icon: ActionMeta["icon"];
  available: boolean;
  config: ConfigRow[];
};

const ACTION_ROWS: ActionRow[] = [
  {
    type: "move_stage",
    group: "Pipeline",
    icon: GearSixIcon,
    available: true,
    config: [{ key: "toStageName", kind: "stage", required: true }],
  },
  {
    type: "set_status",
    group: "Pipeline",
    icon: CheckCircleIcon,
    available: true,
    config: [
      {
        key: "status",
        kind: "select",
        required: true,
        options: [{ value: "active" }, { value: "hired" }, { value: "rejected" }, { value: "withdrawn" }],
      },
    ],
  },
  {
    type: "add_note",
    group: "Candidate",
    icon: PencilIcon,
    available: true,
    config: [{ key: "body", kind: "textarea", required: true, maxLength: 2000, placeholder: true }],
  },
  {
    type: "add_tag",
    group: "Candidate",
    icon: LightningIcon,
    available: true,
    config: [{ key: "label", kind: "tag", required: true, maxLength: 50, placeholder: true }],
  },
  {
    type: "remove_tag",
    group: "Candidate",
    icon: TrashIcon,
    available: true,
    config: [{ key: "label", kind: "tag", required: true, maxLength: 50, placeholder: true }],
  },
  {
    type: "create_task",
    group: "Task",
    icon: CheckCircleIcon,
    available: true,
    config: [
      { key: "title", kind: "text", required: true, maxLength: 200, placeholder: true },
      { key: "description", kind: "textarea", maxLength: 2000, placeholder: true },
      { key: "ownerId", kind: "owner" },
      { key: "priority", kind: "select", options: [{ value: "low" }, { value: "medium" }, { value: "high" }, { value: "urgent" }] },
      { key: "dueOffsetDays", kind: "due-offset" },
    ],
  },
  {
    type: "send_slack",
    group: "Communication",
    icon: ChatCircleDotsIcon,
    available: true,
    config: [
      { key: "message", kind: "textarea", required: true, maxLength: 2000, placeholder: "New application received for {{job_title}}" },
    ],
  },
  {
    type: "send_email",
    group: "Communication",
    icon: EnvelopeSimpleDuotoneIcon,
    available: true,
    config: [
      { key: "templateId", kind: "email-template" },
      { key: "toEmail", kind: "text", placeholder: true },
      { key: "subject", kind: "text", maxLength: 200, placeholder: true },
      { key: "body", kind: "textarea", maxLength: 10000, placeholder: true },
    ],
  },
  {
    type: "send_booking_link",
    group: "Meetings",
    icon: CalendarBlankIcon,
    available: true,
    config: [
      { key: "toEmail", kind: "text", placeholder: true },
      { key: "subject", kind: "text", maxLength: 200, placeholder: "Choose a time to meet with {{company_name}}" },
      { key: "body", kind: "textarea", maxLength: 10000, placeholder: "Pick a time that works for you: {{booking_link}}" },
    ],
  },
  {
    type: "request_documents",
    group: "Documents",
    icon: KeyDuotoneIcon,
    available: true,
    config: [
      { key: "items", kind: "document-list", required: true },
      { key: "dueAt", kind: "datetime" },
    ],
  },
  {
    type: "generate_document",
    group: "Documents",
    icon: KeyDuotoneIcon,
    available: true,
    config: [
      { key: "templateId", kind: "document-template" },
      { key: "title", kind: "text", maxLength: 255, placeholder: true },
      {
        key: "body",
        kind: "textarea",
        maxLength: 50_000,
        placeholder: "Dear {{candidate_full_name}},\n\nThis document is for {{job_title}} at {{company_name}}.",
      },
      { key: "attachments", kind: "document-attachments" },
    ],
  },
  {
    type: "send_document_for_signature",
    group: "Documents",
    icon: PencilIcon,
    available: true,
    config: [
      { key: "documentId", kind: "document" },
      { key: "documentRequestId", kind: "document-request" },
      { key: "recipients", kind: "recipient-list" },
      { key: "subject", kind: "text", maxLength: 255 },
      { key: "message", kind: "textarea", maxLength: 4000 },
    ],
  },
  {
    type: "schedule_interview",
    group: "Meetings",
    icon: MagicWandDuotoneIcon,
    available: true,
    config: [
      { key: "type", kind: "select", options: [{ value: "screening" }, { value: "culture_fit" }, { value: "technical" }, { value: "onsite" }, { value: "final" }] },
      { key: "mode", kind: "select", options: [{ value: "video" }, { value: "phone" }, { value: "onsite" }] },
      {
        key: "meetingProvider",
        kind: "select",
        options: [
          { value: "auto" },
          { value: "google_meet" },
          { value: "zoom" },
          { value: "teams" },
          { value: "jitsi" },
          { value: "external" },
        ],
      },
      { key: "scheduledAt", kind: "datetime", required: true },
      { key: "durationMins", kind: "text", placeholder: "45" },
      { key: "interviewerId", kind: "owner" },
      { key: "title", kind: "text", maxLength: 120, placeholder: true },
      { key: "location", kind: "text", placeholder: true },
      { key: "notes", kind: "textarea", maxLength: 4000 },
    ],
  },
  {
    type: "reschedule_interview",
    group: "Meetings",
    icon: MagicWandDuotoneIcon,
    available: true,
    config: [
      { key: "interviewId", kind: "interview", required: true, placeholder: true },
      { key: "scheduledAt", kind: "datetime", required: true },
      { key: "durationMins", kind: "text", placeholder: "45" },
      { key: "location", kind: "text", placeholder: true },
    ],
  },
  {
    type: "cancel_interview",
    group: "Meetings",
    icon: TrashIcon,
    available: true,
    config: [{ key: "interviewId", kind: "interview", required: true, placeholder: true }],
  },
  {
    type: "http_request",
    group: "External",
    icon: WebhooksDuotoneIcon,
    available: true,
    config: [
      { key: "url", kind: "text", required: true, placeholder: "https://api.example.com/hook" },
      { key: "method", kind: "select", options: ["GET", "POST", "PUT", "PATCH", "DELETE"].map((value) => ({ value, literal: true as const })) },
      { key: "headers", kind: "keyval", placeholder: "Authorization: Bearer {{secrets.TOKEN}}" },
      { key: "body", kind: "textarea", placeholder: "{ \"event\": \"{{trigger.event}}\" }" },
      { key: "secretRefs", kind: "secret-refs", placeholder: "TOKEN, API_KEY" },
    ],
  },
  // Additional registered capabilities are kept beside the core catalog so
  // the picker, inspector, NL preview, and run timeline share one vocabulary.
  {
    type: "send_telegram",
    group: "Communication",
    icon: PaperPlaneDuotoneIcon,
    available: true,
    config: [{ key: "message", kind: "textarea", required: true, maxLength: 2000, placeholder: "New candidate received: {{candidate_name}}" }],
  },
  {
    type: "send_discord",
    group: "Communication",
    icon: ChatCircleDotsIcon,
    available: true,
    config: [{ key: "message", kind: "textarea", required: true, maxLength: 2000, placeholder: "New candidate received: {{candidate_name}}" }],
  },
  {
    type: "send_in_app_alert",
    group: "Communication",
    icon: EnvelopeSimpleDuotoneIcon,
    available: true,
    config: [
      { key: "recipientUserId", kind: "owner" },
      { key: "title", kind: "text", required: true, maxLength: 160, placeholder: true },
      { key: "body", kind: "textarea", maxLength: 2000, placeholder: true },
      { key: "href", kind: "text", placeholder: "/dashboard/candidates/..." },
    ],
  },
  {
    type: "create_offer",
    group: "Task",
    icon: KeyDuotoneIcon,
    available: true,
    config: [
      { key: "title", kind: "text", required: true, maxLength: 200, placeholder: true },
      { key: "salaryAmount", kind: "text", placeholder: "120000" },
      { key: "currency", kind: "text", placeholder: "USD" },
      { key: "salaryPeriod", kind: "select", options: [{ value: "annual" }, { value: "monthly" }] },
      { key: "equity", kind: "text", placeholder: true },
      { key: "startDate", kind: "datetime" },
      { key: "expiresAt", kind: "datetime" },
      { key: "notes", kind: "textarea", maxLength: 5000 },
    ],
  },
  {
    type: "send_offer",
    group: "Communication",
    icon: PaperPlaneDuotoneIcon,
    available: true,
    config: [{ key: "offerId", kind: "text", required: true, placeholder: true }],
  },
  { type: "ai_score", group: "Candidate", icon: MagicWandDuotoneIcon, available: true, config: [] },
  { type: "erase_candidate_data", group: "Candidate", icon: TrashIcon, available: true, config: [] },
  { type: "ai_summarize", group: "External", icon: MagicWandDuotoneIcon, available: false, config: [] },
  { type: "ai_decide", group: "External", icon: MagicWandDuotoneIcon, available: false, config: [] },
];

function resolveConfigField(actionKey: string, row: ConfigRow, t: BuilderT): ConfigField {
  const fieldKey = `catalog.actions.${actionKey}`;
  const label = t(`${fieldKey}.fields.${row.key}`);
  const placeholder =
    row.placeholder === true
      ? t(`${fieldKey}.placeholders.${row.key}`)
      : row.placeholder;
  const options = row.options?.map((option) => ({
    value: option.value,
    label: option.literal
      ? option.value
      : t(`${fieldKey}.options.${row.key}.${option.value}`),
  }));
  return {
    key: row.key,
    label,
    kind: row.kind,
    required: row.required,
    maxLength: row.maxLength,
    placeholder,
    options,
  } as ConfigField;
}

function resolveAction(row: ActionRow, t: BuilderT): ActionMeta {
  const actionKey = `catalog.actions.${camelCase(row.type)}`;
  return {
    type: row.type,
    label: t(`${actionKey}.label`),
    blurb: t(`${actionKey}.blurb`, { secretExample: "{{secrets.NAME}}" }),
    group: row.group,
    groupLabel: t(`catalog.groups.${row.group.toLowerCase()}`),
    icon: row.icon,
    available: row.available,
    config: row.config.map((field) => resolveConfigField(camelCase(row.type), field, t)),
  };
}

export function actionMeta(type: ActionType, t: BuilderT): ActionMeta | undefined {
  const row = ACTION_ROWS.find((entry) => entry.type === type);
  return row ? resolveAction(row, t) : undefined;
}

/** Actions a user is allowed to pick in the builder (registered + available). */
export function pickableActions(
  manifests: readonly SafeAutomationToolManifest[] | undefined,
  t: BuilderT,
): PickableActionMeta[] {
  const latestVersion = new Map<ActionType, number>();
  for (const manifest of manifests ?? []) {
    const previous = latestVersion.get(manifest.type);
    if (previous === undefined || manifest.version > previous) {
      latestVersion.set(manifest.type, manifest.version);
    }
  }

  return ACTION_ROWS
    .filter((action) => action.available)
    .filter((action) => !manifests || latestVersion.has(action.type))
    .map((action) => ({
      ...resolveAction(action, t),
      // Standalone visual tests do not have server data. The live builder
      // always supplies the manifest produced by the versioned registry.
      toolVersion: latestVersion.get(action.type) ?? 1,
    }));
}
