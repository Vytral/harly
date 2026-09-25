import { createHash } from "node:crypto";

export type SignatureEvidenceRecord = {
  envelopeId: string;
  recipientId: string | null;
  eventType: string;
  occurredAt: Date;
  payload: unknown;
  previousHash: string | null;
  currentHash: string;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonical(nested)]),
  );
}
export function computeSignatureEvidenceHash(
  event: SignatureEvidenceRecord,
  previousHash: string | null = event.previousHash,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        previousHash,
        timestamp: event.occurredAt.toISOString(),
        envelopeId: event.envelopeId,
        recipientId: event.recipientId,
        eventType: event.eventType,
        payload: canonical(event.payload),
      }),
    )
    .digest("hex");
}

export function signatureEvidenceChainIsValid(
  events: SignatureEvidenceRecord[],
): boolean {
  let previousHash: string | null = null;
  for (const event of events) {
    if (event.previousHash !== previousHash) return false;
    if (computeSignatureEvidenceHash(event, previousHash) !== event.currentHash) {
      return false;
    }
    previousHash = event.currentHash;
  }
  return true;
}
