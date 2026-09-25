import { FIELD_KIND_CATALOG } from "../catalog";
import { nodeTitle } from "../node-copy";
import { dominatorsOf } from "../../definition/validate";
import { jsonValueSchema, type Binding, type JsonValue, type WorkflowGraphV2 } from "../../definition/schema-v2";

export type BindingOption = {
  id: string;
  group: "Event" | "Application" | "Candidate" | "Job" | "Earlier step";
  label: string;
  example: string;
  origin: string;
  binding: Binding;
  disabled?: boolean;
  reason?: string;
};

const OUTPUT_PATHS: Record<string, { path: string; label: string; example: string }[]> = {
  move_stage: [{ path: "stageId", label: "Stage id", example: "stg_123" }],
  set_status: [{ path: "status", label: "Status", example: "hired" }],
  add_note: [{ path: "noteId", label: "Note id", example: "note_123" }],
  add_tag: [{ path: "label", label: "Tag", example: "onboarding" }],
  remove_tag: [{ path: "label", label: "Removed tag", example: "onboarding" }],
  create_task: [{ path: "taskId", label: "Task id", example: "tsk_123" }],
  send_email: [{ path: "outboxId", label: "Queued email id", example: "mail_123" }],
  http_request: [
    { path: "status", label: "HTTP status", example: "200" },
    { path: "body", label: "Response body", example: "{\"ok\":true}" },
  ],
  send_booking_link: [
    { path: "outboxId", label: "Queued email id", example: "mail_123" },
    { path: "bookingUrl", label: "Booking URL", example: "https://cal.example.com/book" },
  ],
  send_slack: [
    { path: "provider", label: "Chat provider", example: "slack" },
    { path: "queued", label: "Queued", example: "true" },
  ],
  send_telegram: [{ path: "provider", label: "Chat provider", example: "telegram" }],
  send_discord: [{ path: "provider", label: "Chat provider", example: "discord" }],
  send_in_app_alert: [
    { path: "recipientUserId", label: "Recipient user id", example: "usr_123" },
    { path: "notified", label: "Notified", example: "true" },
  ],
  request_documents: [
    { path: "primaryRequestId", label: "Uploaded request id", example: "req_123" },
    { path: "packageId", label: "Document package id", example: "pkg_123" },
  ],
  generate_document: [
    { path: "documentId", label: "Generated document id", example: "doc_123" },
    { path: "documentVersionId", label: "Document version id", example: "ver_123" },
  ],
  send_document_for_signature: [
    { path: "documentId", label: "Signed document id", example: "doc_123" },
    { path: "envelopeId", label: "Signature envelope id", example: "env_123" },
  ],
  schedule_interview: [
    { path: "interviewId", label: "Interview id", example: "int_123" },
    { path: "meetLink", label: "Meeting link", example: "https://meet.example.com/abc" },
  ],
  reschedule_interview: [
    { path: "interviewId", label: "Interview id", example: "int_123" },
    { path: "meetingUrl", label: "Meeting link", example: "https://meet.example.com/abc" },
  ],
  cancel_interview: [{ path: "interviewId", label: "Canceled interview id", example: "int_123" }],
  create_offer: [{ path: "offerId", label: "Offer id", example: "offer_123" }],
  send_offer: [{ path: "offerId", label: "Sent offer id", example: "offer_123" }],
};

function fieldExamples(kind: (typeof FIELD_KIND_CATALOG)[number]["kind"], path: string): string {
  if (path.toLowerCase().includes("email")) return "ada@example.com";
  if (path.toLowerCase().includes("id")) return `${kind}_123`;
  if (path === "score") return "0.82";
  return path;
}

export function bindingOptionsFor(graph: WorkflowGraphV2, nodeId: string): BindingOption[] {
  const options: BindingOption[] = [];
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const current = byId.get(nodeId);
  const dominators = dominatorsOf(graph).get(nodeId) ?? new Set<string>();

  for (const field of FIELD_KIND_CATALOG) {
    if (field.kind === "literal" || field.kind === "ai") continue;
    const group =
      field.kind === "trigger"
        ? "Event"
        : field.kind === "application"
          ? "Application"
          : field.kind === "candidate"
            ? "Candidate"
            : "Job";
    for (const path of field.paths) {
      const binding: Binding =
        field.kind === "trigger"
          ? { kind: "trigger", path }
          : { kind: "trigger", path: `${field.kind}.${path}` };
      options.push({
        id: `${field.kind}:${path}`,
        group,
        label: path,
        example: fieldExamples(field.kind, path),
        origin: field.label,
        binding,
      });
    }
  }

  for (const node of graph.nodes) {
    if (node.id === nodeId || node.type === "end" || node.type === "trigger") continue;
    const guaranteed = dominators.has(node.id);
    const outputs =
      node.type === "action"
        ? (OUTPUT_PATHS[node.actionType] ?? [{ path: "result", label: "Result", example: "ok" }])
        : [{ path: "result", label: "Result", example: "ok" }];
    for (const output of outputs) {
      options.push({
        id: `output:${node.id}:${output.path}`,
        group: "Earlier step",
        label: `${nodeTitle(node)} · ${output.label}`,
        example: output.example,
        origin: nodeTitle(node),
        binding: { kind: "output", nodeId: node.id, path: output.path },
        disabled: !guaranteed,
        reason: guaranteed
          ? undefined
          : "This step is on another branch, so it may not have run.",
      });
    }
  }

  void current;
  return options;
}

export function describeBinding(binding: Binding | undefined, graph?: WorkflowGraphV2): string {
  if (!binding) return "Not set";
  if (binding.kind === "literal") {
    if (binding.value === null) return "Empty";
    if (typeof binding.value === "string") return binding.value || "Empty";
    if (typeof binding.value === "number" || typeof binding.value === "boolean") {
      return String(binding.value);
    }
    return "Value set";
  }
  if (binding.kind === "trigger") return `Event · ${binding.path}`;
  const source = graph?.nodes.find((node) => node.id === binding.nodeId);
  return `${source ? nodeTitle(source) : "Earlier step"} · ${binding.path}`;
}

export function asLiteral(value: unknown): Binding {
  // Config editors can produce nested JSON values (for example the list of
  // document requests or ordered signature recipients). Do not stringify
  // those values: doing so silently turned an otherwise valid UI edit into a
  // registry schema error at publish time.
  const parsed = jsonValueSchema.safeParse(value);
  return {
    kind: "literal",
    value: parsed.success ? (parsed.data as JsonValue) : String(value ?? ""),
  };
}

export function literalValue(binding: Binding | undefined): unknown {
  if (!binding || binding.kind !== "literal") return "";
  return binding.value ?? "";
}
