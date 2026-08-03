import { describe, expect, it } from "vitest";

import {
  computeSignatureEvidenceHash,
  signatureEvidenceChainIsValid,
  type SignatureEvidenceRecord,
} from "./evidence";

function event(input: Partial<SignatureEvidenceRecord> = {}): SignatureEvidenceRecord {
  return {
    envelopeId: "env-1",
    recipientId: "recipient-1",
    eventType: "created",
    occurredAt: new Date("2026-08-03T12:00:00.000Z"),
    payload: { b: 2, a: 1 },
    previousHash: null,
    currentHash: "",
    ...input,
  };
}

describe("signatureEvidenceChainIsValid", () => {
  it("validates the exported hash chain and detects tampering", () => {
    const first = event();
    first.currentHash = computeSignatureEvidenceHash(first);
    const second = event({
      eventType: "completed",
      occurredAt: new Date("2026-08-03T12:01:00.000Z"),
      previousHash: first.currentHash,
      payload: { ok: true },
    });
    second.currentHash = computeSignatureEvidenceHash(second);

    expect(signatureEvidenceChainIsValid([first, second])).toBe(true);
    expect(
      signatureEvidenceChainIsValid([first, { ...second, payload: { ok: false } }]),
    ).toBe(false);
  });
});
