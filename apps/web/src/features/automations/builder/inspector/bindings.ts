import { fieldKindCatalog, type BuilderT } from "../catalog";
import { nodeTitle } from "../node-copy";
import { dominatorsOf } from "../../definition/validate";
import { jsonValueSchema, type Binding, type JsonValue, type WorkflowGraphV2 } from "../../definition/schema-v2";

/** Group ids. Display text comes from `bindings.groups.<group>`. */
export type BindingGroup = "event" | "application" | "candidate" | "job" | "earlierStep";

export type BindingOption = {
  id: string;
  group: BindingGroup;
  label: string;
  example: string;
  origin: string;
  binding: Binding;
  disabled?: boolean;
  reason?: string;
};

const OUTPUT_PATHS: Record<string, { path: string; labelKey: string; example: string }[]> = {
  move_stage: [{ path: "stageId", labelKey: "bindings.outputs.stageId", example: "stg_123" }],
  set_status: [{ path: "status", labelKey: "bindings.outputs.status", example: "hired" }],
  add_note: [{ path: "noteId", labelKey: "bindings.outputs.noteId", example: "note_123" }],
  add_tag: [{ path: "label", labelKey: "bindings.outputs.tag", example: "onboarding" }],
  remove_tag: [{ path: "label", labelKey: "bindings.outputs.removedTag", example: "onboarding" }],
  create_task: [{ path: "taskId", labelKey: "bindings.outputs.taskId", example: "tsk_123" }],
  send_email: [{ path: "outboxId", labelKey: "bindings.outputs.queuedEmailId", example: "mail_123" }],
  http_request: [
    { path: "status", labelKey: "bindings.outputs.httpStatus", example: "200" },
    { path: "body", labelKey: "bindings.outputs.responseBody", example: "{\"ok\":true}" },
  ],
  send_booking_link: [
    { path: "outboxId", labelKey: "bindings.outputs.queuedEmailId", example: "mail_123" },
    { path: "bookingUrl", labelKey: "bindings.outputs.bookingUrl", example: "https://cal.example.com/book" },
  ],
  send_slack: [
    { path: "provider", labelKey: "bindings.outputs.chatProvider", example: "slack" },
    { path: "queued", labelKey: "bindings.outputs.queued", example: "true" },
  ],
  send_telegram: [{ path: "provider", labelKey: "bindings.outputs.chatProvider", example: "telegram" }],
  send_discord: [{ path: "provider", labelKey: "bindings.outputs.chatProvider", example: "discord" }],
  send_in_app_alert: [
    { path: "recipientUserId", labelKey: "bindings.outputs.recipientUserId", example: "usr_123" },
    { path: "notified", labelKey: "bindings.outputs.notified", example: "true" },
  ],
  request_documents: [
    { path: "primaryRequestId", labelKey: "bindings.outputs.uploadedRequestId", example: "req_123" },
    { path: "packageId", labelKey: "bindings.outputs.documentPackageId", example: "pkg_123" },
  ],
  generate_document: [
    { path: "documentId", labelKey: "bindings.outputs.generatedDocumentId", example: "doc_123" },
    { path: "documentVersionId", labelKey: "bindings.outputs.documentVersionId", example: "ver_123" },
  ],
  send_document_for_signature: [
    { path: "documentId", labelKey: "bindings.outputs.signedDocumentId", example: "doc_123" },
    { path: "envelopeId", labelKey: "bindings.outputs.signatureEnvelopeId", example: "env_123" },
  ],
  schedule_interview: [
    { path: "interviewId", labelKey: "bindings.outputs.interviewId", example: "int_123" },
    { path: "meetLink", labelKey: "bindings.outputs.meetingLink", example: "https://meet.example.com/abc" },
  ],
  reschedule_interview: [
    { path: "interviewId", labelKey: "bindings.outputs.interviewId", example: "int_123" },
    { path: "meetingUrl", labelKey: "bindings.outputs.meetingLink", example: "https://meet.example.com/abc" },
  ],
  cancel_interview: [{ path: "interviewId", labelKey: "bindings.outputs.canceledInterviewId", example: "int_123" }],
  create_offer: [{ path: "offerId", labelKey: "bindings.outputs.offerId", example: "offer_123" }],
  send_offer: [{ path: "offerId", labelKey: "bindings.outputs.sentOfferId", example: "offer_123" }],
};

const FIELD_KIND_GROUP: Record<string, BindingGroup> = {
  trigger: "event",
  application: "application",
  candidate: "candidate",
  job: "job",
};

function fieldExamples(kind: string, path: string): string {
  if (path.toLowerCase().includes("email")) return "ada@example.com";
  if (path.toLowerCase().includes("id")) return `${kind}_123`;
  if (path === "score") return "0.82";
  return path;
}

export function bindingOptionsFor(graph: WorkflowGraphV2, nodeId: string, t: BuilderT): BindingOption[] {
  const options: BindingOption[] = [];
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const current = byId.get(nodeId);
  const dominators = dominatorsOf(graph).get(nodeId) ?? new Set<string>();

  for (const field of fieldKindCatalog(t)) {
    if (field.kind === "literal" || field.kind === "ai") continue;
    const group: BindingGroup = FIELD_KIND_GROUP[field.kind] ?? "job";
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
        ? (OUTPUT_PATHS[node.actionType] ?? [{ path: "result", labelKey: "bindings.outputs.result", example: "ok" }])
        : [{ path: "result", labelKey: "bindings.outputs.result", example: "ok" }];
    const stepTitle = nodeTitle(node, t);
    for (const output of outputs) {
      options.push({
        id: `output:${node.id}:${output.path}`,
        group: "earlierStep",
        label: t("bindings.outputLabel", { step: stepTitle, output: t(output.labelKey) }),
        example: output.example,
        origin: stepTitle,
        binding: { kind: "output", nodeId: node.id, path: output.path },
        disabled: !guaranteed,
        reason: guaranteed
          ? undefined
          : t("bindings.onAnotherBranch"),
      });
    }
  }

  void current;
  return options;
}

export function describeBinding(binding: Binding | undefined, graph: WorkflowGraphV2 | undefined, t: BuilderT): string {
  if (!binding) return t("bindings.notSet");
  if (binding.kind === "literal") {
    if (binding.value === null) return t("bindings.empty");
    if (typeof binding.value === "string") return binding.value || t("bindings.empty");
    if (typeof binding.value === "number" || typeof binding.value === "boolean") {
      return String(binding.value);
    }
    return t("bindings.valueSet");
  }
  if (binding.kind === "trigger") return t("bindings.eventPath", { path: binding.path });
  const source = graph?.nodes.find((node) => node.id === binding.nodeId);
  if (!source) return t("bindings.stepPath", { step: t("bindings.earlierStep"), path: binding.path });
  return t("bindings.stepPath", { step: nodeTitle(source, t), path: binding.path });
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
