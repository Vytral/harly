/** Column template for the hub list; the route's loading skeleton uses the same one. */
export const DOCUMENT_LIST_GRID =
  "md:grid-cols-[2.5rem_minmax(14rem,2.2fr)_8.5rem_minmax(7rem,1fr)_minmax(7rem,1fr)_7.5rem_6.5rem]";

export const DOCUMENT_MAX_SIZE = 25 * 1024 * 1024;

export const DOCUMENT_MIME_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/gif": "GIF",
  "image/webp": "WEBP",
};

export const DOCUMENT_STATUS_META = {
  active: { label: "Active", className: "bg-lime-wash text-sage-ink" },
  archived: { label: "Archived", className: "bg-soft-kraft text-soft-ink" },
} as const;

export const SIGNATURE_STATUS_META = {
  unsigned: { label: "Not signed", className: "bg-soft-kraft text-soft-ink" },
  pending: { label: "Pending signature", className: "bg-warning-clay/10 text-warning-clay" },
  signed: { label: "Signed", className: "bg-lime-wash text-sage-ink" },
  declined: { label: "Declined", className: "bg-danger-rust/10 text-danger-rust" },
  expired: { label: "Expired", className: "bg-danger-rust/10 text-danger-rust" },
} as const;

/** Why an expiry/state chip reads the way it does, shared by hub rows and the detail header. */
export type DocumentStateTone = "neutral" | "success" | "warning" | "danger";

/**
 * One combined, scannable state for a document. Archived wins, then the
 * signature lifecycle; a lapsed business date only shows on a document that is
 * not already signed (a completed contract is not "expired" in the list).
 */
export function documentStateMeta(document: {
  status: string;
  signatureStatus: string;
  expiresAt: string | null;
}): { key: string; label: string; tone: DocumentStateTone } {
  if (document.status === "archived") return { key: "archived", label: "Archived", tone: "neutral" };
  switch (document.signatureStatus) {
    case "pending":
      return { key: "pending", label: "Awaiting signature", tone: "warning" };
    case "signed":
      return { key: "signed", label: "Signed", tone: "success" };
    case "declined":
      return { key: "declined", label: "Declined", tone: "danger" };
    case "expired":
      return { key: "expired", label: "Signature expired", tone: "danger" };
    default:
      return document.expiresAt && new Date(document.expiresAt).getTime() < Date.now()
        ? { key: "lapsed", label: "Date passed", tone: "danger" }
        : { key: "active", label: "Not signed", tone: "neutral" };
  }
}

/** Relative hint for a business date: "in 12 days", "3 days ago", "today". */
export function describeExpiry(
  expiresAt: string | null,
  now: number = Date.now(),
): { label: string; tone: DocumentStateTone; days: number } | null {
  if (!expiresAt) return null;
  const days = Math.round((new Date(expiresAt).getTime() - now) / 86_400_000);
  if (days < 0) return { label: `${-days} day${days === -1 ? "" : "s"} ago`, tone: "danger", days };
  if (days === 0) return { label: "today", tone: "warning", days };
  return {
    label: `in ${days} day${days === 1 ? "" : "s"}`,
    tone: days <= 30 ? "warning" : "neutral",
    days,
  };
}

export type SignerState = "waiting" | "invited" | "signed" | "declined" | "voided" | "expired";

export const SIGNER_STATE_META: Record<SignerState, { label: string; tone: DocumentStateTone }> = {
  waiting: { label: "Waiting for turn", tone: "neutral" },
  invited: { label: "Invited", tone: "warning" },
  signed: { label: "Signed", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  voided: { label: "Cancelled", tone: "neutral" },
  expired: { label: "Link expired", tone: "danger" },
};

/** Per-signer state from the recipient row; a sent link past its expiry reads as expired. */
export function deriveSignerState(
  recipient: { status: string; linkExpiresAt: string | null },
  now: number = Date.now(),
): SignerState {
  switch (recipient.status) {
    case "signed":
    case "completed":
      return "signed";
    case "declined":
      return "declined";
    case "voided":
      return "voided";
    case "sent":
    case "delivered":
    case "opened":
      return recipient.linkExpiresAt && new Date(recipient.linkExpiresAt).getTime() <= now
        ? "expired"
        : "invited";
    default:
      return "waiting";
  }
}

export type DocumentSignerItem = {
  id: string;
  name: string;
  email: string;
  order: number;
  state: SignerState;
  signedAt: string | null;
  declinedAt: string | null;
  declinedReason: string | null;
  linkExpiresAt: string | null;
  invitedAt: string | null;
  lastRemindedAt: string | null;
};

export type DocumentSignatureDetail = {
  envelopeId: string;
  provider: string;
  status: string;
  sentAt: string | null;
  completedAt: string | null;
  signers: DocumentSignerItem[];
  /** Artifact ids served by /api/documents/[id]/evidence/[artifactId]. */
  signedDocumentArtifactId: string | null;
  certificateArtifactId: string | null;
};

export type DocumentVersionItem = {
  id: string;
  versionNumber: number;
  sizeBytes: number;
  checksum: string;
  isCurrent: boolean;
  uploadedByName: string | null;
  createdAt: string;
};

/** What a document detail page needs: one document, its versions and signer progress. */
export type DocumentDetailBundle = {
  data: DocumentHubData;
  document: DocumentListItem;
  versions: DocumentVersionItem[];
  signature: DocumentSignatureDetail | null;
};

export type GenerateTemplateOption = { id: string; name: string; title: string };
export type GenerateTargetOption = {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
};

export type DocumentStatus = keyof typeof DOCUMENT_STATUS_META;
export type SignatureStatus = keyof typeof SIGNATURE_STATUS_META;
export type DocumentAssociationType =
  | "workspace"
  | "job"
  | "candidate"
  | "application"
  | "offer";

export type DocumentMember = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type DocumentCategoryItem = {
  id: string;
  name: string;
  slug: string;
  accent: string;
  active: boolean;
};

export type DocumentListItem = {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  status: DocumentStatus;
  signatureStatus: SignatureStatus;
  signatureProvider: string | null;
  signatureEnvelopeId: string | null;
  signatureUrl: string | null;
  manualSignedById: string | null;
  manualSignedByName: string | null;
  manualSignedAt: string | null;
  manualSignatureNote: string | null;
  expiresAt: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerImage: string | null;
  createdByName: string | null;
  category: DocumentCategoryItem | null;
  associationLabels: string[];
  /** Candidate ids this document is linked to, so a candidate-scoped hub view can filter precisely. */
  candidateIds: string[];
  /** Job ids this document is linked to, for the hub's "linked to" filter. */
  jobIds: string[];
  accessRoles: Array<{ roleKey: string; accessLevel: "read" | "manage" }>;
  accessMembers: Array<{ userId: string; accessLevel: "read" | "manage" }>;
  assignments: Array<{ userId: string; assignmentType: "owner" | "reviewer" }>;
  activity: Array<{ id: string; type: string; actorName: string | null; createdAt: string }>;
  versionCount: number;
  currentVersion: number;
  legalHolds: Array<{
    id: string;
    reason: string;
    reference: string | null;
    placedAt: string;
    releasedAt: string | null;
  }>;
  updatedAt: string;
  createdAt: string;
  /** This user's resolved ACL level for this document — "read" means send/sign/manage actions are restricted. */
  currentAccessLevel: "read" | "manage";
};

export type DocumentHubData = {
  documents: DocumentListItem[];
  categories: DocumentCategoryItem[];
  members: DocumentMember[];
  currentUserId: string;
  canManage: boolean;
  canDelete: boolean;
  canShare: boolean;
  remoteSignEnabled: boolean;
  associationOptions: Array<{ type: "candidate" | "job"; id: string; label: string }>;
  esign: { connected: boolean; hasWebhookSecret: boolean };
};

export function formatDocumentSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function documentTypeLabel(mimeType: string) {
  return DOCUMENT_MIME_LABELS[mimeType] ?? "File";
}

export function isPreviewable(mimeType: string) {
  return mimeType === "application/pdf" || mimeType.startsWith("image/") || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

export function slugifyDocumentCategory(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "category";
}
