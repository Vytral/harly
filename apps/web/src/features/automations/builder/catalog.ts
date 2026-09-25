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
    event: "application.status_changed",
    label: "Status changes",
    blurb: "An application status changes, such as active or withdrawn.",
    tone: "outcome",
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
    event: "interview.rescheduled",
    label: "Interview rescheduled",
    blurb: "An interview time or meeting details change.",
    tone: "interview",
  },
  {
    event: "interview.completed",
    label: "Interview completed",
    blurb: "An interview is marked complete.",
    tone: "interview",
  },
  {
    event: "interview.canceled",
    label: "Interview canceled",
    blurb: "An interview is canceled.",
    tone: "interview",
  },
  {
    event: "task.completed",
    label: "Task completed",
    blurb: "A task linked to a candidate or application is completed.",
    tone: "outcome",
  },
  {
    event: "job.published",
    label: "Job published",
    blurb: "A job goes live on the career page.",
    tone: "job",
  },
  {
    event: "document.signature_sent",
    label: "Document sent for signature",
    blurb: "A document is sent to one or more signers.",
    tone: "outcome",
  },
  {
    event: "document.signature_changed",
    label: "Signature status changes",
    blurb: "A signer completes, declines, or otherwise updates a document request.",
    tone: "outcome",
  },
  {
    event: "document.signature_voided",
    label: "Signature request voided",
    blurb: "An in-progress signature request is canceled.",
    tone: "outcome",
  },
  {
    event: "evaluation.completed",
    label: "AI evaluation completed",
    blurb: "Harly finishes scoring a candidate's application.",
    tone: "outcome",
  },
  {
    event: "webhook.received",
    label: "Webhook received",
    blurb: "An external system sends an authenticated event to Harly.",
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

/** Operators shown in the recruiter builder. Regex stays in the engine only. */
export const RECRUITER_OPERATORS: Operator[] = OPERATOR_CATALOG
  .filter((entry) => entry.op !== "regex")
  .map((entry) => entry.op);

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
    blurb: "The latest automatic evaluation score / summary for the candidate.",
    paths: ["score", "recommendation", "summary", "tags"],
  },
  {
    kind: "trigger",
    label: "Trigger payload",
    blurb: "A raw field from the event payload itself.",
    paths: ["jobId", "toStageId", "toStageName", "candidateId", "applicationId", "interview.id"],
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
    config: [{ key: "label", label: "Tag", kind: "tag", required: true, maxLength: 50, placeholder: "e.g. vip" }],
  },
  {
    type: "remove_tag",
    label: "Remove tag",
    blurb: "Remove a tag from the candidate.",
    group: "Candidate",
    icon: TrashIcon,
    available: true,
    config: [{ key: "label", label: "Tag", kind: "tag", required: true, maxLength: 50, placeholder: "e.g. vip" }],
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
      { key: "description", label: "Task details", kind: "textarea", maxLength: 2000, placeholder: "Add context for the assignee" },
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
      { key: "dueOffsetDays", label: "Due date", kind: "due-offset" },
    ],
  },
  {
    type: "send_slack",
    label: "Send chat message",
    blurb: "Post a message to your Slack / Discord channel.",
    group: "Communication",
    icon: ChatCircleDotsIcon,
    available: true,
    config: [{ key: "message", label: "Message", kind: "textarea", required: true, maxLength: 2000, placeholder: "New application received for {{job_title}}" }],
  },
  {
    type: "send_email",
    label: "Send email",
    blurb: "Email the candidate with a template or custom message.",
    group: "Communication",
    icon: EnvelopeSimpleDuotoneIcon,
    available: true,
    config: [
      { key: "templateId", label: "Email template", kind: "email-template" },
      { key: "toEmail", label: "Recipient email", kind: "text", placeholder: "Leave blank for the candidate" },
      { key: "subject", label: "Subject", kind: "text", maxLength: 200, placeholder: "Leave blank to use the template subject" },
      { key: "body", label: "Body", kind: "textarea", maxLength: 10000, placeholder: "Leave blank to use the template body" },
    ],
  },
  {
    type: "send_booking_link",
    label: "Send booking link",
    blurb: "Let the candidate choose an available interview time.",
    group: "Meetings",
    icon: CalendarBlankIcon,
    available: true,
    config: [
      { key: "toEmail", label: "Recipient email", kind: "text", placeholder: "Leave blank for the candidate" },
      { key: "subject", label: "Email subject", kind: "text", maxLength: 200, placeholder: "Choose a time to meet with {{company_name}}" },
      { key: "body", label: "Message", kind: "textarea", maxLength: 10000, placeholder: "Pick a time that works for you: {{booking_link}}" },
    ],
  },
  {
    type: "request_documents",
    label: "Request documents",
    blurb: "Ask the candidate to upload documents in the portal.",
    group: "Documents",
    icon: KeyDuotoneIcon,
    available: true,
    config: [
      { key: "items", label: "Documents to request", kind: "document-list", required: true },
      { key: "dueAt", label: "Candidate deadline", kind: "datetime" },
    ],
  },
  {
    type: "generate_document",
    label: "Generate document",
    blurb: "Create a deterministic PDF from text and workflow variables.",
    group: "Documents",
    icon: KeyDuotoneIcon,
    available: true,
    config: [
      { key: "templateId", label: "Reusable document template", kind: "document-template" },
      { key: "title", label: "Document title", kind: "text", maxLength: 255, placeholder: "Confidentiality agreement" },
      { key: "body", label: "Document content", kind: "textarea", maxLength: 50_000, placeholder: "Dear {{candidate_full_name}},\n\nThis document is for {{job_title}} at {{company_name}}." },
      { key: "attachments", label: "PDF attachments", kind: "document-attachments" },
    ],
  },
  {
    type: "send_document_for_signature",
    label: "Send for signature",
    blurb: "Invite the candidate to sign a PDF in the Harly portal.",
    group: "Documents",
    icon: PencilIcon,
    available: true,
    config: [
      { key: "documentId", label: "Existing document to sign", kind: "document" },
      { key: "documentRequestId", label: "Uploaded request from a previous step", kind: "document-request" },
      { key: "recipients", label: "Signing order", kind: "recipient-list" },
      { key: "subject", label: "Email subject", kind: "text", maxLength: 255 },
      { key: "message", label: "Message", kind: "textarea", maxLength: 4000 },
    ],
  },
  {
    type: "schedule_interview",
    label: "Schedule interview",
    blurb: "Book a conflict-checked interview and notify the candidate.",
    group: "Meetings",
    icon: MagicWandDuotoneIcon,
    available: true,
    config: [
      { key: "type", label: "Interview type", kind: "select", options: [
        { value: "screening", label: "Screening" },
        { value: "culture_fit", label: "Culture fit" },
        { value: "technical", label: "Technical" },
        { value: "onsite", label: "On-site" },
        { value: "final", label: "Final" },
      ] },
      { key: "mode", label: "Format", kind: "select", options: [
        { value: "video", label: "Video" },
        { value: "phone", label: "Phone" },
        { value: "onsite", label: "On-site" },
      ] },
      { key: "meetingProvider", label: "Meeting provider", kind: "select", options: [
        { value: "auto", label: "Automatically choose connected provider" },
        { value: "google_meet", label: "Google Meet (Google Calendar required)" },
        { value: "zoom", label: "Zoom (Zoom connection required)" },
        { value: "teams", label: "Microsoft Teams (Outlook connection required)" },
        { value: "jitsi", label: "Jitsi Meet (Jitsi connection required)" },
        { value: "external", label: "External meeting URL" },
      ] },
      { key: "scheduledAt", label: "Starts at", kind: "datetime", required: true },
      { key: "durationMins", label: "Duration (minutes)", kind: "text", placeholder: "45" },
      { key: "interviewerId", label: "Interviewer", kind: "owner" },
      { key: "title", label: "Interview title", kind: "text", maxLength: 120, placeholder: "e.g. Technical interview" },
      { key: "location", label: "Location / room", kind: "text", placeholder: "Optional room or meeting location" },
      { key: "notes", label: "Notes", kind: "textarea", maxLength: 4000 },
    ],
  },
  {
    type: "reschedule_interview",
    label: "Reschedule interview",
    blurb: "Move an existing interview and synchronize its providers.",
    group: "Meetings",
    icon: MagicWandDuotoneIcon,
    available: true,
    config: [
      { key: "interviewId", label: "Interview", kind: "interview", required: true, placeholder: "Choose an interview or use the trigger" },
      { key: "scheduledAt", label: "New start time", kind: "datetime", required: true },
      { key: "durationMins", label: "Duration (minutes)", kind: "text", placeholder: "45" },
      { key: "location", label: "Location / room", kind: "text", placeholder: "Optional room or meeting location" },
    ],
  },
  {
    type: "cancel_interview",
    label: "Cancel interview",
    blurb: "Cancel an interview and clean up connected meeting providers.",
    group: "Meetings",
    icon: TrashIcon,
    available: true,
    config: [
      { key: "interviewId", label: "Interview", kind: "interview", required: true, placeholder: "Choose an interview or use the trigger" },
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
  // Additional registered capabilities are kept beside the core catalog so
  // the picker, inspector, NL preview, and run timeline share one vocabulary.
  { type: "send_telegram", label: "Send Telegram", blurb: "Post a message to the configured Telegram chat.", group: "Communication", icon: PaperPlaneDuotoneIcon, available: true, config: [{ key: "message", label: "Message", kind: "textarea", required: true, maxLength: 2000, placeholder: "New candidate received: {{candidate_name}}" }] },
  { type: "send_discord", label: "Send Discord", blurb: "Post a message to the configured Discord channel.", group: "Communication", icon: ChatCircleDotsIcon, available: true, config: [{ key: "message", label: "Message", kind: "textarea", required: true, maxLength: 2000, placeholder: "New candidate received: {{candidate_name}}" }] },
  { type: "send_in_app_alert", label: "Create in-app alert", blurb: "Notify a teammate inside Harly with a durable, deduplicated alert.", group: "Communication", icon: EnvelopeSimpleDuotoneIcon, available: true, config: [
    { key: "recipientUserId", label: "Recipient", kind: "owner" },
    { key: "title", label: "Alert title", kind: "text", required: true, maxLength: 160, placeholder: "Review this candidate" },
    { key: "body", label: "Message", kind: "textarea", maxLength: 2000, placeholder: "A workflow needs your attention." },
    { key: "href", label: "Harly path", kind: "text", placeholder: "/dashboard/candidates/..." },
  ] },
  { type: "create_offer", label: "Create offer", blurb: "Prepare a compensation offer for the candidate.", group: "Task", icon: KeyDuotoneIcon, available: true, config: [
    { key: "title", label: "Offer title", kind: "text", required: true, maxLength: 200, placeholder: "Senior Engineer offer" },
    { key: "salaryAmount", label: "Salary amount", kind: "text", placeholder: "120000" },
    { key: "currency", label: "Currency", kind: "text", placeholder: "USD" },
    { key: "salaryPeriod", label: "Salary period", kind: "select", options: [{ value: "annual", label: "Annual" }, { value: "monthly", label: "Monthly" }] },
    { key: "equity", label: "Equity", kind: "text", placeholder: "e.g. 0.25% options" },
    { key: "startDate", label: "Start date", kind: "datetime" },
    { key: "expiresAt", label: "Expires at", kind: "datetime" },
    { key: "notes", label: "Notes", kind: "textarea", maxLength: 5000 },
  ] },
  { type: "send_offer", label: "Send offer", blurb: "Queue the offer email or portal signature request.", group: "Communication", icon: PaperPlaneDuotoneIcon, available: true, config: [{ key: "offerId", label: "Offer ID", kind: "text", required: true, placeholder: "Use the offerId from Create offer" }] },
  { type: "ai_score", label: "AI evaluation", blurb: "Generate candidate match score and fit evaluation with AI.", group: "Candidate", icon: MagicWandDuotoneIcon, available: true, config: [] },
  { type: "erase_candidate_data", label: "Erase candidate data", blurb: "Remove the candidate from normal views and queue durable erasure of related data. Requires candidate deletion permission.", group: "Candidate", icon: TrashIcon, available: true, config: [] },
  { type: "ai_summarize", label: "AI: summarize", blurb: "Not available in automations until its output retention and privacy contract is complete.", group: "External", icon: MagicWandDuotoneIcon, available: false, config: [] },
  { type: "ai_decide", label: "AI: decide", blurb: "Not available: hiring decisions require an explicit human decision.", group: "External", icon: MagicWandDuotoneIcon, available: false, config: [] },
];

export function actionMeta(type: ActionType): ActionMeta | undefined {
  return ACTION_CATALOG.find((a) => a.type === type);
}

/** Actions a user is allowed to pick in the builder (registered + available). */
export function pickableActions(
  manifests?: readonly SafeAutomationToolManifest[],
): PickableActionMeta[] {
  const latestVersion = new Map<ActionType, number>();
  for (const manifest of manifests ?? []) {
    const previous = latestVersion.get(manifest.type);
    if (previous === undefined || manifest.version > previous) {
      latestVersion.set(manifest.type, manifest.version);
    }
  }

  return ACTION_CATALOG
    .filter((action) => action.available)
    .filter((action) => !manifests || latestVersion.has(action.type))
    .map((action) => ({
      ...action,
      // Standalone visual tests do not have server data. The live builder
      // always supplies the manifest produced by the versioned registry.
      toolVersion: latestVersion.get(action.type) ?? 1,
    }));
}
