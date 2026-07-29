/**
 * Client-safe shared types + status metadata for document requests. Imported by
 * both the recruiter dashboard and the candidate portal, so it must stay free of
 * server-only imports.
 */

export const DOCUMENT_REQUEST_STATUS_META = {
  pending: { label: "Awaiting upload", className: "bg-status-quiet text-status-quiet-ink" },
  submitted: { label: "In review", className: "bg-warning-clay/10 text-warning-clay" },
  accepted: { label: "Accepted", className: "bg-sage-wash text-success-olive" },
  declined: { label: "Declined", className: "bg-danger-rust/10 text-danger-rust" },
  waived: { label: "Waived", className: "bg-status-quiet text-status-quiet-ink" },
} as const;

export type DocumentRequestStatus = keyof typeof DOCUMENT_REQUEST_STATUS_META;

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
  title: string;
  instructions: string | null;
  status: DocumentRequestStatus;
  dueAt: string | null;
  documentId: string | null;
  documentName: string | null;
  requestedByName: string | null;
  submittedAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
};
