import type { WorkflowNode } from "../definition/schema-v2";
import type { NodeOutcome } from "./advance";

export type SimulationPreset = "success" | "action_failure" | "uncertain_wait";

/**
 * A deterministic starting point for the Test tab. The user may override any
 * individual fixture before the server runs the pure simulator.
 */
export function defaultSimulationFixture(node: WorkflowNode, preset: SimulationPreset = "success"): NodeOutcome {
  if (node.type === "action") {
    if (preset === "action_failure") {
      return { status: "failed", code: "SIMULATED_ACTION_FAILURE", retryable: false };
    }
    return {
      status: "succeeded",
      output: actionOutputFixture(node.actionType, node.toolVersion),
    };
  }

  if (preset === "uncertain_wait" && (node.type === "delay" || node.type === "approval" || node.type === "wait")) {
    return { status: "uncertain", code: "SIMULATED_PROVIDER_UNCERTAINTY" };
  }

  if (node.type === "delay") {
    return { status: "succeeded", output: { simulated: true }, port: "elapsed" };
  }
  if (node.type === "approval") {
    return { status: "succeeded", output: { simulated: true, approved: true }, port: "approved" };
  }
  if (node.type === "wait") {
    return {
      status: "succeeded",
      output: { simulated: true, completed: true },
      port: node.kind === "document_package" ? "completed" : "matched",
    };
  }
  return { status: "succeeded", output: { simulated: true } };
}

/**
 * These outputs are deliberately synthetic, stable and shaped like the
 * registered tool contracts. They make downstream bindings testable without
 * suggesting that a provider or a real resource was touched.
 */
function actionOutputFixture(
  actionType: Extract<WorkflowNode, { type: "action" }>["actionType"],
  toolVersion: number,
) {
  const base = { simulated: true, actionType, toolVersion } as const;
  // Fixtures are part of the immutable tool contract. Do not accidentally
  // reuse v1 output when a future tool version changes its public shape.
  if (toolVersion !== 1) return base;
  switch (actionType) {
    case "move_stage":
      return { ...base, applicationId: "sim-application-1", toStageId: "sim-stage-1" };
    case "set_status":
      return { ...base, applicationId: "sim-application-1", status: "in_progress" };
    case "ai_score":
      return {
        ...base,
        applicationId: "sim-application-1",
        score: 85,
        recommendation: "strong_yes",
        evaluationId: "sim-eval-00000000-0000-4000-8000-000000000001",
      };
    case "erase_candidate_data":
      return {
        ...base,
        candidateId: "sim-candidate-00000000-0000-4000-8000-000000000001",
        deletionJobId: "sim-deletion-00000000-0000-4000-8000-000000000001",
        queued: true,
        status: "pending",
      };
    case "add_note":
      return { ...base, noteId: "sim-note-1", candidateId: "sim-candidate-1" };
    case "add_tag":
    case "remove_tag":
      return { ...base, candidateId: "sim-candidate-1", label: "simulated" };
    case "create_offer":
      return { ...base, offerId: "sim-offer-00000000-0000-4000-8000-000000000001", applicationId: "sim-application-1", status: "draft" };
    case "request_documents":
      return { ...base, applicationId: "sim-application-1", candidateId: "sim-candidate-1", packageId: "sim-package-00000000-0000-4000-8000-000000000001", primaryRequestId: "sim-request-1", requestIds: ["sim-request-1"], reused: false };
    case "send_document_for_signature":
      return { ...base, documentId: "sim-document-00000000-0000-4000-8000-000000000001", documentRequestId: "sim-request-1", envelopeId: "sim-envelope-1", recipientId: "sim-recipient-1" };
    case "schedule_interview":
      return { ...base, interviewId: "sim-interview-00000000-0000-4000-8000-000000000001", applicationId: "sim-application-1", candidateId: "sim-candidate-1", scheduledAt: "2099-01-01T10:00:00.000Z", meetLink: "https://simulated.invalid/interview" };
    case "reschedule_interview":
      return { ...base, interviewId: "sim-interview-00000000-0000-4000-8000-000000000001", applicationId: "sim-application-1", candidateId: "sim-candidate-1", scheduledAt: "2099-01-01T10:00:00.000Z", meetingUrl: "https://simulated.invalid/interview" };
    case "cancel_interview":
      return { ...base, interviewId: "sim-interview-00000000-0000-4000-8000-000000000001", applicationId: "sim-application-1", candidateId: "sim-candidate-1", status: "canceled" };
    case "generate_document":
      return { ...base, documentId: "sim-document-00000000-0000-4000-8000-000000000001", documentVersionId: "sim-document-version-1", applicationId: "sim-application-1", candidateId: "sim-candidate-1", reused: false };
    case "send_offer":
      return { ...base, offerId: "sim-offer-00000000-0000-4000-8000-000000000001", status: "sent" };
    case "create_task":
      return { ...base, taskId: "sim-task-00000000-0000-4000-8000-000000000001" };
    case "send_slack":
      return { ...base, provider: "slack", queued: true };
    case "send_telegram":
      return { ...base, provider: "telegram" };
    case "send_discord":
      return { ...base, provider: "discord" };
    case "send_in_app_alert":
      return { ...base, recipientUserId: "sim-user-1", notified: true };
    case "send_email":
      return { ...base, outboxId: "sim-outbox-1", queued: true };
    case "send_booking_link":
      return { ...base, outboxId: "sim-outbox-1", bookingUrl: "https://simulated.invalid/booking", queued: true };
    case "http_request":
      return { ...base, status: 200, body: "{\"simulated\":true}" };
    default:
      return base;
  }
}
