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
  active: { label: "Active", className: "bg-primary/10 text-primary" },
  archived: { label: "Archived", className: "bg-muted text-muted-foreground" },
} as const;

export const SIGNATURE_STATUS_META = {
  unsigned: { label: "Not signed", className: "bg-muted text-muted-foreground" },
  pending: { label: "Pending signature", className: "bg-amber-500/10 text-amber-700" },
  signed: { label: "Signed", className: "bg-primary/10 text-primary" },
  declined: { label: "Declined", className: "bg-destructive/10 text-destructive" },
  expired: { label: "Expired", className: "bg-destructive/10 text-destructive" },
} as const;

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
  expiresAt: string | null;
  ownerId: string | null;
  ownerName: string | null;
  createdByName: string | null;
  category: DocumentCategoryItem | null;
  associationLabels: string[];
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
};

export type DocumentHubData = {
  documents: DocumentListItem[];
  categories: DocumentCategoryItem[];
  members: DocumentMember[];
  currentUserId: string;
  canManage: boolean;
  canShare: boolean;
  associationOptions: Array<{ type: "candidate" | "job"; id: string; label: string }>;
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
