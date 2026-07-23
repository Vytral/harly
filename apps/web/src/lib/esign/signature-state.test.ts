import { describe, expect, it } from "vitest";

import {
  canAdvanceSignatureEnvelope,
  eventForDocusealWebhook,
  isExternallyManagedSignatureProvider,
  signatureEnvelopeStatusForEvent,
  signatureEventForProviderStatus,
  signatureReconcileDelayMs,
} from "./signature-state";

describe("signature envelope state", () => {
  it("maps only envelope lifecycle events", () => {
    expect(signatureEnvelopeStatusForEvent("envelope-sent")).toBe("sent");
    expect(signatureEnvelopeStatusForEvent("envelope-completed")).toBe("completed");
    expect(signatureEnvelopeStatusForEvent("recipient-completed")).toBeNull();
  });

  it("does not let late events revert a terminal state", () => {
    expect(canAdvanceSignatureEnvelope("sent", "delivered")).toBe(true);
    expect(canAdvanceSignatureEnvelope("delivered", "completed")).toBe(true);
    expect(canAdvanceSignatureEnvelope("completed", "delivered")).toBe(false);
    expect(canAdvanceSignatureEnvelope("declined", "completed")).toBe(false);
  });

  it("identifies provider-owned signature state", () => {
    expect(isExternallyManagedSignatureProvider("docuseal")).toBe(true);
    expect(isExternallyManagedSignatureProvider(" DocuSeal ")).toBe(true);
    expect(isExternallyManagedSignatureProvider("manual")).toBe(false);
    expect(isExternallyManagedSignatureProvider("docusign")).toBe(false);
    expect(isExternallyManagedSignatureProvider(null)).toBe(false);
  });

  it("normalizes DocuSeal submission poll statuses with bounded backoff", () => {
    expect(signatureEventForProviderStatus("completed")).toBe("envelope-completed");
    expect(signatureEventForProviderStatus("pending")).toBe("envelope-sent");
    expect(signatureEventForProviderStatus("declined")).toBe("envelope-declined");
    expect(signatureEventForProviderStatus("expired")).toBe("envelope-voided");
    expect(signatureEventForProviderStatus("unknown-state")).toBeNull();
    expect(signatureReconcileDelayMs("pending")).toBe(5 * 60 * 1000);
    expect(signatureReconcileDelayMs("completed")).toBe(60 * 60 * 1000);
    expect(signatureReconcileDelayMs("expired")).toBe(60 * 60 * 1000);
  });

  it("maps DocuSeal webhook event types to lifecycle events", () => {
    expect(eventForDocusealWebhook("submission.created")).toBe("envelope-sent");
    expect(eventForDocusealWebhook("submission.completed")).toBe("envelope-completed");
    expect(eventForDocusealWebhook("submission.expired")).toBe("envelope-voided");
    expect(eventForDocusealWebhook("submission.archived")).toBe("envelope-voided");
    expect(eventForDocusealWebhook("form.declined")).toBe("envelope-declined");
    expect(eventForDocusealWebhook("form.viewed")).toBe("envelope-delivered");
    expect(eventForDocusealWebhook("form.completed")).toBe("envelope-completed");
    // A form.completed on an already-declined submission stays declined.
    expect(eventForDocusealWebhook("form.completed", "declined")).toBe("envelope-declined");
    expect(eventForDocusealWebhook("form.started")).toBeNull();
  });
});
