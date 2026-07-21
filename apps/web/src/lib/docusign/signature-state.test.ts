import { describe, expect, it } from "vitest";

import {
  canAdvanceSignatureEnvelope,
  isExternallyManagedSignatureProvider,
  signatureEventForProviderStatus,
  signatureReconcileDelayMs,
  signatureEnvelopeStatusForEvent,
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
    expect(isExternallyManagedSignatureProvider("docusign")).toBe(true);
    expect(isExternallyManagedSignatureProvider(" DocuSign ")).toBe(true);
    expect(isExternallyManagedSignatureProvider("manual")).toBe(false);
    expect(isExternallyManagedSignatureProvider(null)).toBe(false);
  });

  it("normalizes provider poll statuses and uses bounded backoff", () => {
    expect(signatureEventForProviderStatus("completed")).toBe("envelope-completed");
    expect(signatureEventForProviderStatus("signed")).toBe("envelope-completed");
    expect(signatureEventForProviderStatus("created")).toBeNull();
    expect(signatureReconcileDelayMs("sent")).toBe(5 * 60 * 1000);
    expect(signatureReconcileDelayMs("signed")).toBe(60 * 60 * 1000);
    expect(signatureReconcileDelayMs("completed")).toBe(60 * 60 * 1000);
  });
});
