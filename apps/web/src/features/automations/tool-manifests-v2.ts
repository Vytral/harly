import type { ActionType } from "./schema";

export type AutomationInputType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object";

export type AutomationResourceType =
  | "stage"
  | "member"
  | "email_template"
  | "document_template"
  | "document"
  | "webhook_secret"
  | "webhook_endpoint"
  | "interview"
  | "offer"
  | "cal_event_type"
  | "integration"
  | "job";

export type AutomationToolInputDescriptor = {
  name: string;
  type: AutomationInputType;
  required: boolean;
  description: string;
  enum?: readonly string[];
  format?: string; // e.g. "uuid", "email", "url", "iso_datetime", "iso_date", "template_string"
  maxLength?: number;
  supportsBinding: boolean;
  resourceType?: AutomationResourceType;
};

export type AutomationToolOutputDescriptor = {
  path: string;
  type: string;
  nullable: boolean;
  description: string;
};

export type AutomationToolSimulationContract = {
  mode: "stateful" | "fixture" | "unsupported";
  scenarios: readonly string[];
};

export type AutomationToolManifestV2 = {
  type: ActionType;
  version: number;
  label: string;
  description: string;
  category:
    | "candidate"
    | "documents"
    | "interviews"
    | "offers"
    | "tasks"
    | "messaging"
    | "integrations";
  effect: "internal_write" | "external_write";
  requiresPermission: string;
  requiredPermissions: readonly string[];
  integrationRequirements: readonly string[];
  targetPolicy: "trigger" | "trigger_or_override";
  targetFields: readonly ("applicationId" | "candidateId" | "jobId" | "interviewId" | "offerId")[];
  outputFields: readonly string[];
  inputs: readonly AutomationToolInputDescriptor[];
  outputs: readonly AutomationToolOutputDescriptor[];
  simulation: AutomationToolSimulationContract;
  examples: readonly {
    description: string;
    input: Record<string, unknown>;
  }[];
};

export const ACTION_TOOL_MANIFESTS_V2: readonly AutomationToolManifestV2[] = [
  {
    type: "move_stage",
    version: 1,
    label: "Move stage",
    description: "Move an application to a different pipeline stage in its job.",
    category: "candidate",
    effect: "internal_write",
    requiresPermission: "candidates:move",
    requiredPermissions: ["candidates:move"],
    integrationRequirements: [],
    targetPolicy: "trigger",
    targetFields: ["applicationId"],
    outputFields: ["applicationId", "toStageId"],
    inputs: [
      {
        name: "applicationId",
        type: "string",
        required: false,
        description: "Application ID. Inferred from the trigger event when omitted.",
        format: "uuid",
        supportsBinding: true,
      },
      {
        name: "toStageId",
        type: "string",
        required: true,
        description: "Destination stage ID in the job pipeline.",
        format: "uuid",
        supportsBinding: true,
        resourceType: "stage",
      },
    ],
    outputs: [
      { path: "applicationId", type: "string", nullable: false, description: "Target application ID" },
      { path: "toStageId", type: "string", nullable: false, description: "New stage ID" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success", "application_not_found"],
    },
    examples: [
      {
        description: "Advance candidate to the Technical Interview stage",
        input: { toStageId: { kind: "literal", value: "stage-tech-interview-uuid" } },
      },
    ],
  },
  {
    type: "set_status",
    version: 1,
    label: "Set application status",
    description: "Update the status of an application (active, archived, rejected, or hired).",
    category: "candidate",
    effect: "internal_write",
    requiresPermission: "candidates:edit",
    requiredPermissions: ["candidates:edit"],
    integrationRequirements: [],
    targetPolicy: "trigger",
    targetFields: ["applicationId"],
    outputFields: ["applicationId", "status"],
    inputs: [
      {
        name: "applicationId",
        type: "string",
        required: false,
        description: "Application ID. Inferred from trigger event if omitted.",
        format: "uuid",
        supportsBinding: true,
      },
      {
        name: "status",
        type: "string",
        required: true,
        description: "New status for the application.",
        enum: ["active", "archived", "rejected", "hired"],
        supportsBinding: false,
      },
      {
        name: "rejectionReason",
        type: "string",
        required: false,
        description: "Optional rejection reason when setting status to rejected.",
        maxLength: 500,
        supportsBinding: true,
      },
    ],
    outputs: [
      { path: "applicationId", type: "string", nullable: false, description: "Target application ID" },
      { path: "status", type: "string", nullable: false, description: "Updated status" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Mark candidate application as hired",
        input: { status: { kind: "literal", value: "hired" } },
      },
    ],
  },
  {
    type: "ai_score",
    version: 1,
    label: "Score with AI",
    description: "Evaluate candidate match against job requirements and generate a fit score.",
    category: "candidate",
    effect: "internal_write",
    requiresPermission: "candidates:edit",
    requiredPermissions: ["candidates:edit"],
    integrationRequirements: [],
    targetPolicy: "trigger",
    targetFields: ["applicationId"],
    outputFields: ["applicationId", "score", "recommendation", "evaluationId"],
    inputs: [
      {
        name: "applicationId",
        type: "string",
        required: false,
        description: "Application ID. Inferred from trigger event if omitted.",
        format: "uuid",
        supportsBinding: true,
      },
    ],
    outputs: [
      { path: "applicationId", type: "string", nullable: false, description: "Target application ID" },
      { path: "score", type: "number", nullable: false, description: "Candidate match score" },
      { path: "recommendation", type: "string", nullable: false, description: "Hiring recommendation" },
      { path: "evaluationId", type: "string", nullable: true, description: "ID of the saved evaluation" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Evaluate applicant fit using AI",
        input: {},
      },
    ],
  },
  {
    type: "erase_candidate_data",
    version: 1,
    label: "Erase candidate data",
    description: "Remove a candidate from normal views and queue durable erasure of related ATS and stored data. Default executionMode require_approval (approval on every path). automatic is allowed only when workspace data retention is enabled.",
    category: "candidate",
    effect: "internal_write",
    requiresPermission: "candidates:delete",
    requiredPermissions: ["candidates:delete"],
    integrationRequirements: [],
    targetPolicy: "trigger_or_override",
    targetFields: ["candidateId"],
    outputFields: ["candidateId", "deletionJobId", "queued", "status"],
    inputs: [
      {
        name: "candidateId",
        type: "string",
        required: false,
        description: "Candidate ID. Inferred from the trigger event when omitted.",
        format: "uuid",
        supportsBinding: true,
      },
      {
        name: "executionMode",
        type: "string",
        required: false,
        description: "require_approval (default) or automatic (only with workspace data retention enabled).",
        supportsBinding: false,
      },
    ],
    outputs: [
      { path: "candidateId", type: "string", nullable: false, description: "Candidate being erased" },
      { path: "deletionJobId", type: "string", nullable: false, description: "Durable erasure job ID" },
      { path: "queued", type: "boolean", nullable: false, description: "Whether the worker still has erasure work to complete" },
      { path: "status", type: "string", nullable: false, description: "Durable erasure job status" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success", "legal_hold", "candidate_not_found"],
    },
    examples: [
      {
        description: "Queue complete erasure after a rejection email",
        input: {},
      },
    ],
  },
  {
    type: "add_note",
    version: 1,
    label: "Add candidate note",
    description: "Append a timeline note to the candidate record.",
    category: "candidate",
    effect: "internal_write",
    requiresPermission: "collab:write",
    requiredPermissions: ["collab:write"],
    integrationRequirements: [],
    targetPolicy: "trigger_or_override",
    targetFields: ["candidateId"],
    outputFields: ["noteId", "candidateId"],
    inputs: [
      {
        name: "candidateId",
        type: "string",
        required: false,
        description: "Candidate ID. Inferred from trigger event if omitted.",
        format: "uuid",
        supportsBinding: true,
      },
      {
        name: "content",
        type: "string",
        required: true,
        description: "Note body text. Supports {{variable}} interpolation.",
        format: "template_string",
        maxLength: 5000,
        supportsBinding: true,
      },
    ],
    outputs: [
      { path: "noteId", type: "string", nullable: false, description: "Created note ID" },
      { path: "candidateId", type: "string", nullable: false, description: "Target candidate ID" },
    ],
    simulation: {
      mode: "stateful",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Add automated screening note",
        input: { content: { kind: "literal", value: "Automated check passed for candidate." } },
      },
    ],
  },
  {
    type: "add_tag",
    version: 1,
    label: "Add tag",
    description: "Attach a tag label to the candidate.",
    category: "candidate",
    effect: "internal_write",
    requiresPermission: "candidates:edit",
    requiredPermissions: ["candidates:edit"],
    integrationRequirements: [],
    targetPolicy: "trigger_or_override",
    targetFields: ["candidateId"],
    outputFields: ["candidateId", "label"],
    inputs: [
      {
        name: "candidateId",
        type: "string",
        required: false,
        description: "Candidate ID. Inferred from trigger event if omitted.",
        format: "uuid",
        supportsBinding: true,
      },
      {
        name: "label",
        type: "string",
        required: true,
        description: "Tag label to attach.",
        maxLength: 50,
        supportsBinding: true,
      },
    ],
    outputs: [
      { path: "candidateId", type: "string", nullable: false, description: "Candidate ID" },
      { path: "label", type: "string", nullable: false, description: "Added tag label" },
    ],
    simulation: {
      mode: "stateful",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Tag candidate as VIP",
        input: { label: { kind: "literal", value: "vip" } },
      },
    ],
  },
  {
    type: "remove_tag",
    version: 1,
    label: "Remove tag",
    description: "Detach a tag label from the candidate.",
    category: "candidate",
    effect: "internal_write",
    requiresPermission: "candidates:edit",
    requiredPermissions: ["candidates:edit"],
    integrationRequirements: [],
    targetPolicy: "trigger_or_override",
    targetFields: ["candidateId"],
    outputFields: ["candidateId", "label"],
    inputs: [
      {
        name: "candidateId",
        type: "string",
        required: false,
        description: "Candidate ID. Inferred from trigger event if omitted.",
        format: "uuid",
        supportsBinding: true,
      },
      {
        name: "label",
        type: "string",
        required: true,
        description: "Tag label to remove.",
        maxLength: 50,
        supportsBinding: true,
      },
    ],
    outputs: [
      { path: "candidateId", type: "string", nullable: false, description: "Candidate ID" },
      { path: "label", type: "string", nullable: false, description: "Removed tag label" },
    ],
    simulation: {
      mode: "stateful",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Remove pending-review tag",
        input: { label: { kind: "literal", value: "pending-review" } },
      },
    ],
  },
  {
    type: "request_documents",
    version: 1,
    label: "Request documents",
    description: "Request document uploads or signing tasks from the candidate portal.",
    category: "documents",
    effect: "internal_write",
    requiresPermission: "documents:manage",
    requiredPermissions: ["documents:manage"],
    integrationRequirements: [],
    targetPolicy: "trigger",
    targetFields: ["applicationId"],
    outputFields: ["applicationId", "candidateId", "packageId", "primaryRequestId", "requestIds", "reused"],
    inputs: [
      {
        name: "applicationId",
        type: "string",
        required: false,
        description: "Application ID. Inferred from trigger if omitted.",
        format: "uuid",
        supportsBinding: true,
      },
      {
        name: "items",
        type: "array",
        required: true,
        description: "List of document template items or requirements to request.",
        supportsBinding: false,
        resourceType: "document_template",
      },
      {
        name: "instructions",
        type: "string",
        required: false,
        description: "Custom instructions for the candidate in the portal.",
        format: "template_string",
        maxLength: 2000,
        supportsBinding: true,
      },
    ],
    outputs: [
      { path: "packageId", type: "string", nullable: false, description: "Created document package ID" },
      { path: "primaryRequestId", type: "string", nullable: true, description: "First document request ID" },
      { path: "requestIds", type: "array", nullable: false, description: "All document request IDs" },
      { path: "reused", type: "boolean", nullable: false, description: "Whether an existing package was reused" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Request background check and ID verification",
        input: {
          items: {
            kind: "literal",
            value: [{ title: "Identity Document", type: "upload" }],
          },
        },
      },
    ],
  },
  {
    type: "generate_document",
    version: 1,
    label: "Generate document",
    description: "Generate a personalized PDF document from an approved document template.",
    category: "documents",
    effect: "internal_write",
    requiresPermission: "documents:manage",
    requiredPermissions: ["documents:manage"],
    integrationRequirements: [],
    targetPolicy: "trigger",
    targetFields: ["applicationId"],
    outputFields: ["documentId", "documentVersionId", "applicationId", "candidateId", "reused"],
    inputs: [
      {
        name: "applicationId",
        type: "string",
        required: false,
        description: "Application ID. Inferred from trigger event if omitted.",
        format: "uuid",
        supportsBinding: true,
      },
      {
        name: "templateId",
        type: "string",
        required: true,
        description: "Workflow document template ID to generate from.",
        format: "uuid",
        supportsBinding: true,
        resourceType: "document_template",
      },
      {
        name: "documentTitle",
        type: "string",
        required: false,
        description: "Generated document title.",
        maxLength: 120,
        supportsBinding: true,
      },
      {
        name: "variables",
        type: "object",
        required: false,
        description: "Template variable overrides.",
        supportsBinding: true,
      },
    ],
    outputs: [
      { path: "documentId", type: "string", nullable: false, description: "Generated document ID" },
      { path: "documentVersionId", type: "string", nullable: false, description: "Initial document version ID" },
      { path: "reused", type: "boolean", nullable: false, description: "Whether an existing generated document was reused" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Generate non-disclosure agreement",
        input: {
          templateId: { kind: "literal", value: "nda-template-uuid" },
          documentTitle: { kind: "literal", value: "Mutual NDA" },
        },
      },
    ],
  },
  {
    type: "send_document_for_signature",
    version: 1,
    label: "Send for e-signature",
    description: "Send a generated PDF document for cryptographic signature via the portal or remote email.",
    category: "documents",
    effect: "external_write",
    requiresPermission: "documents:manage",
    requiredPermissions: ["documents:manage"],
    integrationRequirements: [],
    targetPolicy: "trigger",
    targetFields: ["applicationId", "candidateId"],
    outputFields: ["documentId", "documentRequestId", "envelopeId", "recipientId"],
    inputs: [
      {
        name: "documentId",
        type: "string",
        required: true,
        description: "Document ID to send for signing.",
        format: "uuid",
        supportsBinding: true,
        resourceType: "document",
      },
      {
        name: "signers",
        type: "array",
        required: true,
        description: "Signer list with email, name, and role.",
        supportsBinding: false,
      },
      {
        name: "subject",
        type: "string",
        required: false,
        description: "Signing request subject line.",
        maxLength: 200,
        supportsBinding: true,
      },
    ],
    outputs: [
      { path: "documentId", type: "string", nullable: false, description: "Document ID" },
      { path: "documentRequestId", type: "string", nullable: false, description: "Document request tracking ID" },
      { path: "recipientId", type: "string", nullable: false, description: "Primary signer recipient ID" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Send offer letter to candidate for signature",
        input: {
          documentId: { kind: "step_output", stepId: "gen-doc", path: "documentId" },
          signers: {
            kind: "literal",
            value: [{ role: "candidate", email: "candidate@example.com", name: "Candidate Name" }],
          },
        },
      },
    ],
  },
  {
    type: "schedule_interview",
    version: 1,
    label: "Schedule interview",
    description: "Schedule a video, phone, or in-person interview with calendar and meeting links.",
    category: "interviews",
    effect: "external_write",
    requiresPermission: "interviews:manage",
    requiredPermissions: ["interviews:manage"],
    integrationRequirements: ["meeting_provider"],
    targetPolicy: "trigger",
    targetFields: ["applicationId", "candidateId", "jobId"],
    outputFields: ["interviewId", "applicationId", "candidateId", "scheduledAt", "meetLink"],
    inputs: [
      {
        name: "title",
        type: "string",
        required: true,
        description: "Interview title.",
        maxLength: 120,
        supportsBinding: true,
      },
      {
        name: "scheduledAt",
        type: "string",
        required: true,
        description: "ISO 8601 date-time string.",
        format: "iso_datetime",
        supportsBinding: true,
      },
      {
        name: "durationMins",
        type: "number",
        required: true,
        description: "Interview duration in minutes.",
        supportsBinding: false,
      },
      {
        name: "type",
        type: "string",
        required: true,
        description: "Interview category.",
        enum: ["screening", "technical", "behavioral", "final", "other"],
        supportsBinding: false,
      },
      {
        name: "mode",
        type: "string",
        required: true,
        description: "Meeting mode.",
        enum: ["video", "phone", "in_person"],
        supportsBinding: false,
      },
      {
        name: "interviewerIds",
        type: "array",
        required: false,
        description: "Workspace member IDs conducting the interview.",
        supportsBinding: false,
        resourceType: "member",
      },
    ],
    outputs: [
      { path: "interviewId", type: "string", nullable: false, description: "Created interview ID" },
      { path: "scheduledAt", type: "string", nullable: false, description: "Confirmed interview time" },
      { path: "meetLink", type: "string", nullable: true, description: "Meeting video link (Zoom, Teams, or Jitsi)" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Schedule initial video screen",
        input: {
          title: { kind: "literal", value: "Initial Screening" },
          scheduledAt: { kind: "literal", value: "2026-10-05T14:00:00Z" },
          durationMins: { kind: "literal", value: 30 },
          type: { kind: "literal", value: "screening" },
          mode: { kind: "literal", value: "video" },
        },
      },
    ],
  },
  {
    type: "reschedule_interview",
    version: 1,
    label: "Reschedule interview",
    description: "Update the date and time of an existing interview.",
    category: "interviews",
    effect: "external_write",
    requiresPermission: "interviews:manage",
    requiredPermissions: ["interviews:manage"],
    integrationRequirements: ["meeting_provider"],
    targetPolicy: "trigger",
    targetFields: ["interviewId"],
    outputFields: ["interviewId", "applicationId", "candidateId", "scheduledAt", "meetingUrl"],
    inputs: [
      {
        name: "interviewId",
        type: "string",
        required: true,
        description: "Interview ID to reschedule.",
        format: "uuid",
        supportsBinding: true,
        resourceType: "interview",
      },
      {
        name: "scheduledAt",
        type: "string",
        required: true,
        description: "New ISO 8601 date-time string.",
        format: "iso_datetime",
        supportsBinding: true,
      },
    ],
    outputs: [
      { path: "interviewId", type: "string", nullable: false, description: "Interview ID" },
      { path: "scheduledAt", type: "string", nullable: false, description: "New scheduled time" },
      { path: "meetingUrl", type: "string", nullable: true, description: "Updated meeting URL" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Reschedule interview to new slot",
        input: {
          interviewId: { kind: "step_output", stepId: "prev-step", path: "interviewId" },
          scheduledAt: { kind: "literal", value: "2026-10-06T15:00:00Z" },
        },
      },
    ],
  },
  {
    type: "cancel_interview",
    version: 1,
    label: "Cancel interview",
    description: "Cancel an upcoming scheduled interview.",
    category: "interviews",
    effect: "external_write",
    requiresPermission: "interviews:manage",
    requiredPermissions: ["interviews:manage"],
    integrationRequirements: [],
    targetPolicy: "trigger",
    targetFields: ["interviewId"],
    outputFields: ["interviewId", "applicationId", "candidateId", "status"],
    inputs: [
      {
        name: "interviewId",
        type: "string",
        required: true,
        description: "Interview ID to cancel.",
        format: "uuid",
        supportsBinding: true,
        resourceType: "interview",
      },
      {
        name: "reason",
        type: "string",
        required: false,
        description: "Reason for cancellation.",
        maxLength: 500,
        supportsBinding: true,
      },
    ],
    outputs: [
      { path: "interviewId", type: "string", nullable: false, description: "Interview ID" },
      { path: "status", type: "string", nullable: false, description: "Canceled status" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Cancel interview when candidate declines",
        input: {
          interviewId: { kind: "step_output", stepId: "prev-step", path: "interviewId" },
          reason: { kind: "literal", value: "Candidate withdrew application." },
        },
      },
    ],
  },
  {
    type: "create_offer",
    version: 1,
    label: "Create offer",
    description: "Draft a formal job offer for the candidate's application.",
    category: "offers",
    effect: "internal_write",
    requiresPermission: "offers:manage",
    requiredPermissions: ["offers:manage"],
    integrationRequirements: [],
    targetPolicy: "trigger",
    targetFields: ["applicationId"],
    outputFields: ["offerId", "applicationId", "status"],
    inputs: [
      {
        name: "applicationId",
        type: "string",
        required: false,
        description: "Application ID. Inferred from trigger if omitted.",
        format: "uuid",
        supportsBinding: true,
      },
      {
        name: "salary",
        type: "number",
        required: true,
        description: "Annual or base compensation amount.",
        supportsBinding: true,
      },
      {
        name: "currency",
        type: "string",
        required: true,
        description: "ISO 4217 three-letter currency code (e.g. USD, EUR, CLP).",
        maxLength: 3,
        supportsBinding: false,
      },
      {
        name: "startDate",
        type: "string",
        required: false,
        description: "Proposed start date (YYYY-MM-DD).",
        format: "iso_date",
        supportsBinding: true,
      },
      {
        name: "notes",
        type: "string",
        required: false,
        description: "Internal notes or conditions.",
        maxLength: 2000,
        supportsBinding: true,
      },
    ],
    outputs: [
      { path: "offerId", type: "string", nullable: false, description: "Created offer ID" },
      { path: "status", type: "string", nullable: false, description: "Draft offer status" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Draft software engineer offer",
        input: {
          salary: { kind: "literal", value: 95000 },
          currency: { kind: "literal", value: "USD" },
          startDate: { kind: "literal", value: "2026-11-01" },
        },
      },
    ],
  },
  {
    type: "send_offer",
    version: 1,
    label: "Send offer",
    description: "Send an approved job offer to the candidate.",
    category: "offers",
    effect: "external_write",
    requiresPermission: "offers:manage",
    requiredPermissions: ["offers:manage"],
    integrationRequirements: [],
    targetPolicy: "trigger",
    targetFields: ["offerId"],
    outputFields: ["offerId", "status"],
    inputs: [
      {
        name: "offerId",
        type: "string",
        required: true,
        description: "Offer ID to send.",
        format: "uuid",
        supportsBinding: true,
        resourceType: "offer",
      },
    ],
    outputs: [
      { path: "offerId", type: "string", nullable: false, description: "Offer ID" },
      { path: "status", type: "string", nullable: false, description: "Sent status" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Send drafted offer to candidate",
        input: {
          offerId: { kind: "step_output", stepId: "create-offer-step", path: "offerId" },
        },
      },
    ],
  },
  {
    type: "create_task",
    version: 1,
    label: "Create task",
    description: "Create a recruiting to-do task assigned to a team member.",
    category: "tasks",
    effect: "internal_write",
    requiresPermission: "tasks:write",
    requiredPermissions: ["tasks:write"],
    integrationRequirements: [],
    targetPolicy: "trigger",
    targetFields: ["applicationId", "candidateId", "jobId"],
    outputFields: ["taskId"],
    inputs: [
      {
        name: "title",
        type: "string",
        required: true,
        description: "Task title.",
        maxLength: 200,
        supportsBinding: true,
      },
      {
        name: "description",
        type: "string",
        required: false,
        description: "Task instructions.",
        maxLength: 2000,
        supportsBinding: true,
      },
      {
        name: "priority",
        type: "string",
        required: true,
        description: "Task priority level.",
        enum: ["low", "medium", "high", "urgent"],
        supportsBinding: false,
      },
      {
        name: "dueDate",
        type: "string",
        required: false,
        description: "Due date in YYYY-MM-DD format.",
        format: "iso_date",
        supportsBinding: true,
      },
      {
        name: "assigneeId",
        type: "string",
        required: false,
        description: "Team member user ID assigned to the task.",
        format: "uuid",
        supportsBinding: true,
        resourceType: "member",
      },
    ],
    outputs: [
      { path: "taskId", type: "string", nullable: false, description: "Created task ID" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Create high priority task to review references",
        input: {
          title: { kind: "literal", value: "Review candidate references" },
          priority: { kind: "literal", value: "high" },
        },
      },
    ],
  },
  {
    type: "send_slack",
    version: 1,
    label: "Send Slack message",
    description: "Post a notification message to a Slack channel.",
    category: "messaging",
    effect: "external_write",
    requiresPermission: "automations:manage",
    requiredPermissions: ["automations:manage"],
    integrationRequirements: ["slack"],
    targetPolicy: "trigger",
    targetFields: [],
    outputFields: ["provider", "queued"],
    inputs: [
      {
        name: "channel",
        type: "string",
        required: true,
        description: "Slack channel name or ID (e.g. #hiring-alerts).",
        maxLength: 80,
        supportsBinding: true,
      },
      {
        name: "message",
        type: "string",
        required: true,
        description: "Message text. Supports template variables like {{candidate.name}}.",
        format: "template_string",
        maxLength: 3000,
        supportsBinding: true,
      },
    ],
    outputs: [
      { path: "provider", type: "string", nullable: false, description: "Slack provider identifier" },
      { path: "queued", type: "boolean", nullable: false, description: "Whether message was queued in outbox" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Post notification on Slack when candidate reaches final stage",
        input: {
          channel: { kind: "literal", value: "#recruiting" },
          message: { kind: "literal", value: "Candidate {{candidate.firstName}} moved to Final Interview." },
        },
      },
    ],
  },
  {
    type: "send_telegram",
    version: 1,
    label: "Send Telegram message",
    description: "Post a notification message to a Telegram chat.",
    category: "messaging",
    effect: "external_write",
    requiresPermission: "automations:manage",
    requiredPermissions: ["automations:manage"],
    integrationRequirements: ["telegram"],
    targetPolicy: "trigger",
    targetFields: [],
    outputFields: ["provider"],
    inputs: [
      {
        name: "chatId",
        type: "string",
        required: true,
        description: "Telegram chat ID.",
        maxLength: 80,
        supportsBinding: true,
      },
      {
        name: "message",
        type: "string",
        required: true,
        description: "Message body with template interpolation.",
        format: "template_string",
        maxLength: 3000,
        supportsBinding: true,
      },
    ],
    outputs: [
      { path: "provider", type: "string", nullable: false, description: "Telegram provider identifier" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Send Telegram message on new application",
        input: {
          chatId: { kind: "literal", value: "-10012345678" },
          message: { kind: "literal", value: "New applicant for {{job.title}}!" },
        },
      },
    ],
  },
  {
    type: "send_discord",
    version: 1,
    label: "Send Discord message",
    description: "Post a message to a Discord channel.",
    category: "messaging",
    effect: "external_write",
    requiresPermission: "automations:manage",
    requiredPermissions: ["automations:manage"],
    integrationRequirements: ["discord"],
    targetPolicy: "trigger",
    targetFields: [],
    outputFields: ["provider"],
    inputs: [
      {
        name: "channelId",
        type: "string",
        required: true,
        description: "Discord channel ID.",
        maxLength: 80,
        supportsBinding: true,
      },
      {
        name: "message",
        type: "string",
        required: true,
        description: "Message text with template interpolation.",
        format: "template_string",
        maxLength: 2000,
        supportsBinding: true,
      },
    ],
    outputs: [
      { path: "provider", type: "string", nullable: false, description: "Discord provider identifier" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Post Discord notification",
        input: {
          channelId: { kind: "literal", value: "9876543210" },
          message: { kind: "literal", value: "Offer accepted by candidate!" },
        },
      },
    ],
  },
  {
    type: "send_in_app_alert",
    version: 1,
    label: "Send in-app notification",
    description: "Send an internal inbox notification to a specific team member.",
    category: "messaging",
    effect: "internal_write",
    requiresPermission: "automations:manage",
    requiredPermissions: ["automations:manage"],
    integrationRequirements: [],
    targetPolicy: "trigger",
    targetFields: [],
    outputFields: ["recipientUserId", "notified"],
    inputs: [
      {
        name: "recipientUserId",
        type: "string",
        required: true,
        description: "Workspace member user ID to notify.",
        format: "uuid",
        supportsBinding: true,
        resourceType: "member",
      },
      {
        name: "title",
        type: "string",
        required: true,
        description: "Notification title.",
        maxLength: 120,
        supportsBinding: true,
      },
      {
        name: "body",
        type: "string",
        required: true,
        description: "Notification body text.",
        format: "template_string",
        maxLength: 1000,
        supportsBinding: true,
      },
    ],
    outputs: [
      { path: "recipientUserId", type: "string", nullable: false, description: "Recipient member ID" },
      { path: "notified", type: "boolean", nullable: false, description: "Whether notification was sent" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Alert hiring manager of pending approval",
        input: {
          recipientUserId: { kind: "literal", value: "user-uuid" },
          title: { kind: "literal", value: "Candidate Ready for Decision" },
          body: { kind: "literal", value: "All interview scorecards are submitted for {{candidate.name}}." },
        },
      },
    ],
  },
  {
    type: "send_email",
    version: 1,
    label: "Send email",
    description: "Send an email to the candidate or custom address using a template or custom body.",
    category: "messaging",
    effect: "external_write",
    requiresPermission: "automations:manage",
    requiredPermissions: ["automations:manage"],
    integrationRequirements: ["email"],
    targetPolicy: "trigger",
    targetFields: ["candidateId"],
    outputFields: ["outboxId", "queued"],
    inputs: [
      {
        name: "templateId",
        type: "string",
        required: false,
        description: "Email template ID. If omitted, subject and body must be provided.",
        format: "uuid",
        supportsBinding: true,
        resourceType: "email_template",
      },
      {
        name: "toEmail",
        type: "string",
        required: false,
        description: "Override recipient email. Inferred from candidate if omitted.",
        format: "email",
        supportsBinding: true,
      },
      {
        name: "subject",
        type: "string",
        required: false,
        description: "Email subject line (required when not using template).",
        maxLength: 200,
        supportsBinding: true,
      },
      {
        name: "body",
        type: "string",
        required: false,
        description: "Email body in HTML or plain text with template variables.",
        format: "template_string",
        maxLength: 10000,
        supportsBinding: true,
      },
    ],
    outputs: [
      { path: "outboxId", type: "string", nullable: false, description: "Created outbox entry ID" },
      { path: "queued", type: "boolean", nullable: false, description: "Whether email was queued for dispatch" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Send invitation to schedule interview",
        input: {
          templateId: { kind: "literal", value: "email-template-interview-invite" },
        },
      },
    ],
  },
  {
    type: "send_booking_link",
    version: 1,
    label: "Send Cal.com booking link",
    description: "Generate and email a personal Cal.com scheduling link to the candidate.",
    category: "messaging",
    effect: "external_write",
    requiresPermission: "automations:manage",
    requiredPermissions: ["automations:manage"],
    integrationRequirements: ["cal"],
    targetPolicy: "trigger",
    targetFields: ["candidateId", "applicationId"],
    outputFields: ["outboxId", "bookingUrl", "queued"],
    inputs: [
      {
        name: "eventTypeId",
        type: "string",
        required: true,
        description: "Cal.com event type slug or ID.",
        maxLength: 100,
        supportsBinding: true,
        resourceType: "cal_event_type",
      },
      {
        name: "candidateId",
        type: "string",
        required: false,
        description: "Candidate ID. Inferred from trigger if omitted.",
        format: "uuid",
        supportsBinding: true,
      },
      {
        name: "applicationId",
        type: "string",
        required: false,
        description: "Application ID. Inferred from trigger if omitted.",
        format: "uuid",
        supportsBinding: true,
      },
    ],
    outputs: [
      { path: "outboxId", type: "string", nullable: false, description: "Email outbox entry ID" },
      { path: "bookingUrl", type: "string", nullable: false, description: "Generated Cal.com booking URL" },
      { path: "queued", type: "boolean", nullable: false, description: "Whether email was queued" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success"],
    },
    examples: [
      {
        description: "Send screening booking link",
        input: {
          eventTypeId: { kind: "literal", value: "screening-30min" },
        },
      },
    ],
  },
  {
    type: "http_request",
    version: 1,
    label: "HTTP request (Webhook)",
    description: "Make an outbound HTTP request to an external webhook or API endpoint.",
    category: "integrations",
    effect: "external_write",
    requiresPermission: "automations:manage",
    requiredPermissions: ["automations:manage"],
    integrationRequirements: [],
    targetPolicy: "trigger",
    targetFields: [],
    outputFields: ["status", "body"],
    inputs: [
      {
        name: "url",
        type: "string",
        required: true,
        description: "Target URL (HTTP or HTTPS, SSRF-protected).",
        format: "url",
        supportsBinding: true,
      },
      {
        name: "method",
        type: "string",
        required: true,
        description: "HTTP method.",
        enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        supportsBinding: false,
      },
      {
        name: "headers",
        type: "object",
        required: false,
        description: "HTTP request headers (key-value object).",
        supportsBinding: true,
      },
      {
        name: "body",
        type: "string",
        required: false,
        description: "Request body payload (JSON or string).",
        maxLength: 20000,
        supportsBinding: true,
      },
      {
        name: "secretName",
        type: "string",
        required: false,
        description: "Optional workspace secret name to inject into Bearer auth header.",
        maxLength: 100,
        supportsBinding: false,
        resourceType: "webhook_secret",
      },
    ],
    outputs: [
      { path: "status", type: "number", nullable: false, description: "HTTP response status code" },
      { path: "body", type: "string", nullable: true, description: "Response body text" },
    ],
    simulation: {
      mode: "fixture",
      scenarios: ["success", "timeout", "http_error"],
    },
    examples: [
      {
        description: "Notify external HR system via webhook",
        input: {
          url: { kind: "literal", value: "https://api.example.com/webhooks/candidate" },
          method: { kind: "literal", value: "POST" },
          body: { kind: "literal", value: "{\"candidateId\": \"{{candidate.id}}\"}" },
        },
      },
    ],
  },
] as const;

export function listAutomationToolManifestsV2(): readonly AutomationToolManifestV2[] {
  return ACTION_TOOL_MANIFESTS_V2;
}

export function getAutomationToolManifestV2(
  type: ActionType,
  version = 1,
): AutomationToolManifestV2 | undefined {
  return ACTION_TOOL_MANIFESTS_V2.find(
    (manifest) => manifest.type === type && manifest.version === version,
  );
}
