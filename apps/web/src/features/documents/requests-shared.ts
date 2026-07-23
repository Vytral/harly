/**
 * Client-safe shared types + status metadata for document requests. Imported by
 * both the recruiter dashboard and the candidate portal, so it must stay free of
 * server-only imports.
 */

export const DOCUMENT_REQUEST_STATUS_META = {
  pending: { label: "Awaiting upload", className: "bg-amber-500/10 text-amber-700" },
  submitted: { label: "In review", className: "bg-sky-500/10 text-sky-700" },
  accepted: { label: "Accepted", className: "bg-primary/10 text-primary" },
  declined: { label: "Declined", className: "bg-destructive/10 text-destructive" },
  waived: { label: "Waived", className: "bg-muted text-muted-foreground" },
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
