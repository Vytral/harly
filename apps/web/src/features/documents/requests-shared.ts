/**
 * Client-safe shared types + status metadata for document requests. Imported by
 * both the recruiter dashboard and the candidate portal, so it must stay free of
 * server-only imports.
 */

/** Labels live in `labels.documents.requestStatus.<status>`. */
export const DOCUMENT_REQUEST_STATUS_META = {
  pending: { className: "bg-status-quiet text-status-quiet-ink" },
  submitted: { className: "bg-warning-clay/10 text-warning-clay" },
  accepted: { className: "bg-sage-wash text-success-olive" },
  declined: { className: "bg-danger-rust/10 text-danger-rust" },
  waived: { className: "bg-status-quiet text-status-quiet-ink" },
} as const;

export type DocumentRequestStatus = keyof typeof DOCUMENT_REQUEST_STATUS_META;

export type DocumentSignatureStatus = "unsigned" | "pending" | "signed" | "declined" | "expired";

/** Terminal states can't be re-uploaded or re-reviewed. */
const TERMINAL = new Set<DocumentRequestStatus>(["accepted", "waived"]);

export function isTerminalRequestStatus(status: string): boolean {
  return TERMINAL.has(status as DocumentRequestStatus);
}

/** The candidate may (re)upload only while pending or after a decline. */
export function canCandidateUpload(status: string): boolean {
  return status === "pending" || status === "declined";
}

/** A reviewer may act only on a submitted request. */
export function canReviewRequest(status: string): boolean {
  return status === "submitted";
}

export type DocumentRequestItem = {
  id: string;
  applicationId: string;
  candidateId: string;
  packageId: string | null;
  title: string;
  instructions: string | null;
  status: DocumentRequestStatus;
  dueAt: string | null;
  documentId: string | null;
  documentName: string | null;
  signatureStatus: DocumentSignatureStatus | null;
  signatureProvider: string | null;
  requestedByName: string | null;
  submittedAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
};
