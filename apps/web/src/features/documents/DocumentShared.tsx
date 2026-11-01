"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileArchive, FileImage, FileText, Plus } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Checkbox } from "@/components/ui/checkbox";
import { DropZone } from "@/components/ui/drop-zone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  StatusPill as BaseStatusPill,
  type StatusPillTone,
} from "@/components/ui/status-pill";
import {
  createDocument,
  createDocumentCategory,
  createDocumentVersion,
  saveDocumentAcl,
  updateDocumentCategory,
} from "./actions";
import {
  DOCUMENT_MAX_SIZE,
  type DocumentCategoryItem,
  type DocumentHubData,
  type DocumentListItem,
} from "./shared";
import {
  allowedDocumentContentTypes,
  documentExtensionMatches,
} from "@/lib/storage-validation";

export function iconForDocument(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType === "application/pdf" || mimeType.includes("word"))
    return FileText;
  return FileArchive;
}

/** Client-side file gate mirroring the presign + server validation. */
export function validateDocumentFile(file: File): string | null {
  if (
    !allowedDocumentContentTypes.includes(
      file.type as (typeof allowedDocumentContentTypes)[number],
    )
  ) {
    return "Choose a PDF, DOC, DOCX, PNG, JPG, GIF, or WEBP file.";
  }
  if (file.size <= 0 || file.size > DOCUMENT_MAX_SIZE) {
    return "Documents must be between 1 byte and 25 MB.";
  }
  if (!documentExtensionMatches(file.name, file.type)) {
    return "The file extension does not match its content type.";
  }
  return null;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Presign, PUT to storage, and return the storage key. Throws on failure. */
export async function uploadToStorage(
  file: File,
): Promise<{ key: string; checksum: string }> {
  const checksum = await sha256Hex(await file.arrayBuffer());
  const presignResponse = await fetch("/api/documents/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      contentLength: file.size,
    }),
  });
  const presign = (await presignResponse.json()) as {
    uploadUrl?: string;
    key?: string;
  };
  if (!presignResponse.ok || !presign.uploadUrl || !presign.key)
    throw new Error("Could not prepare the document upload.");
  const upload = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!upload.ok) throw new Error("Could not upload the document.");
  return { key: presign.key, checksum };
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

const ACTIVITY_LABELS: Record<string, string> = {
  "document.uploaded": "Uploaded",
  "document.generated": "Generated from a template",
  "document.version_created": "New version uploaded",
  "document.viewed": "Viewed",
  "document.downloaded": "Downloaded",
  "document.renamed": "Renamed",
  "document.archived": "Archived",
  "document.restored": "Restored",
  "document.deleted": "Deleted",
  "document.category_changed": "Category changed",
  "document.assigned": "Assigned",
  "document.unassigned": "Unassigned",
  "document.date_set": "Date changed",
  "document.permissions_changed": "Access rules changed",
  "document.requested": "Requested from candidate",
  "document.signature_sent": "Sent for signature",
  "document.signature_reminded": "Signer reminded",
  "document.signature_link_copied": "Signing link issued",
  "document.signature_changed": "Signature status changed",
  "document.signature_voided": "Signature request voided",
  "document.legal_hold_placed": "Legal hold placed",
  "document.legal_hold_released": "Legal hold released",
  "document.evidence_exported": "Evidence exported",
  "document.expired": "Expired",
};

export function formatActivityType(type: string) {
  const known = ACTIVITY_LABELS[type];
  if (known) return known;
  const plain = type.replace(/^document\./, "").replaceAll("_", " ");
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

/**
 * Documents-local name kept for existing callers. Delegates to the shared
 * primitive. `className` still wins over the tone for status colours that a
 * caller computes from its own metadata.
 */
export function StatusPill({
  children,
  className,
  tone = "neutral",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: StatusPillTone;
}) {
  return (
    <BaseStatusPill tone={tone} size="sm" className={className}>
      {children}
    </BaseStatusPill>
  );
}

export function UploadDialog({
  data,
  open,
  onOpenChange,
  replaceDocument = null,
  defaultAssociation = null,
}: {
  data: DocumentHubData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replaceDocument?: DocumentListItem | null;
  /** Pre-select an association (the candidate a filtered hub is scoped to). */
  defaultAssociation?: { type: "candidate" | "job"; id: string } | null;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [associationType, setAssociationType] = useState<
    "workspace" | "candidate" | "job"
  >(defaultAssociation?.type ?? "workspace");
  const [associationId, setAssociationId] = useState(defaultAssociation?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setName("");
    setCategoryId("");
    setAssociationType(defaultAssociation?.type ?? "workspace");
    setAssociationId(defaultAssociation?.id ?? "");
    setError(null);
  }

  function chooseFile(next: File | null) {
    setError(null);
    if (!next) return;
    const validationError = validateDocumentFile(next);
    if (validationError) {
      setError(validationError);
      return;
    }
    setFile(next);
    setName(next.name.replace(/\.[^.]+$/, ""));
  }

  function submit() {
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    startTransition(async () => {
      try {
        const { key, checksum } = await uploadToStorage(file);
        const result = replaceDocument
          ? await createDocumentVersion({
              documentId: replaceDocument.id,
              originalName: file.name,
              mimeType: file.type,
              sizeBytes: file.size,
              checksum,
              storageKey: key,
            })
          : await createDocument({
              name: name.trim() || file.name,
              originalName: file.name,
              mimeType: file.type,
              sizeBytes: file.size,
              checksum,
              storageKey: key,
              categoryId: categoryId || null,
              association: {
                targetType: associationType,
                targetId:
                  associationType === "workspace"
                    ? null
                    : associationId || null,
              },
            });
        if (!result.ok)
          throw new Error(result.error ?? "Could not save the document.");
        toast.success(
          replaceDocument ? "New version uploaded" : "Document uploaded",
        );
        reset();
        onOpenChange(false);
        router.refresh();
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not upload the document.",
        );
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) reset();
        onOpenChange(value);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {replaceDocument ? "Upload new version" : "Upload document"}
          </DialogTitle>
          <DialogDescription>
            {replaceDocument
              ? `Replaces the current file for “${replaceDocument.name}”. Previous versions remain in the audit trail.`
              : "Keep contracts, credentials, and hiring files in one workspace-scoped vault."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="document-file">File</Label>
            <DropZone
              id="document-file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp"
              title={file?.name ?? "Drag a file here or click to browse"}
              hint="PDF, DOCX, or image · up to 25 MB"
              onFiles={([next]) => chooseFile(next ?? null)}
            />
          </div>
          {!replaceDocument ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="document-name">Display name</Label>
                <Input
                  id="document-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Offer letter — Taylor Okafor"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="document-category">Category</Label>
                <Select
                  value={categoryId || "none"}
                  onValueChange={(value) => setCategoryId(value === "none" ? "" : value)}
                >
                  <SelectTrigger id="document-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="none">No category</SelectItem>
                    {data.categories
                      .filter((category) => category.active)
                      .map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="document-association">Associate with</Label>
                <Select
                  value={associationType}
                  onValueChange={(next) => {
                    setAssociationType(next as "workspace" | "candidate" | "job");
                    setAssociationId("");
                  }}
                >
                  <SelectTrigger id="document-association" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="workspace">Workspace library</SelectItem>
                    <SelectItem value="candidate">Candidate</SelectItem>
                    <SelectItem value="job">Job</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {associationType !== "workspace" ? (
                <div className="space-y-2">
                  <Label htmlFor="document-association-target">
                    Choose {associationType}
                  </Label>
                  <Select value={associationId} onValueChange={setAssociationId}>
                    <SelectTrigger id="document-association-target" className="w-full">
                      <SelectValue placeholder={`Select a ${associationType}`} />
                    </SelectTrigger>
                    <SelectContent position="popper" className="max-h-64">
                      {data.associationOptions
                        .filter((option) => option.type === associationType)
                        .map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </>
          ) : null}
          {error ? <Callout tone="danger">{error}</Callout> : null}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? "Uploading…" : replaceDocument ? "Upload new version" : "Upload document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AccessDialog({
  data,
  document,
  open,
  onOpenChange,
}: {
  data: DocumentHubData;
  document: DocumentListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [roles, setRoles] = useState<
    Array<{ roleKey: string; accessLevel: "read" | "manage" }>
  >(() => document.accessRoles);
  const [members, setMembers] = useState<
    Array<{ userId: string; accessLevel: "read" | "manage" }>
  >(() => document.accessMembers);
  const [isPending, startTransition] = useTransition();
  function toggleRole(roleKey: string) {
    setRoles((current) =>
      current.some((rule) => rule.roleKey === roleKey)
        ? current.filter((rule) => rule.roleKey !== roleKey)
        : [...current, { roleKey, accessLevel: "read" }],
    );
  }
  function toggleMember(userId: string) {
    setMembers((current) =>
      current.some((rule) => rule.userId === userId)
        ? current.filter((rule) => rule.userId !== userId)
        : [...current, { userId, accessLevel: "read" }],
    );
  }
  function save() {
    startTransition(async () => {
      const result = await saveDocumentAcl({
        documentId: document!.id,
        roles,
        members,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not update access.");
        return;
      }
      toast.success("Access updated");
      onOpenChange(false);
      router.refresh();
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage access</DialogTitle>
          <DialogDescription>
            {document.name}. Members need both the global Documents permission
            and an ACL match.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-5 overflow-y-auto py-2">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-soft-ink">
              Roles
            </p>
            <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-inner)] bg-card-inset">
              {[...new Set(data.members.map((member) => member.role))].map(
                (role) => {
                  const checked = roles.some((rule) => rule.roleKey === role);
                  return (
                    <label
                      key={role}
                      className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-soft-kraft"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleRole(role)}
                      />
                      {role.replace(/[-_]/g, " ")}
                    </label>
                  );
                },
              )}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-soft-ink">
              Specific members
            </p>
            <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-inner)] bg-card-inset">
              {data.members.map((member) => {
                const checked = members.some(
                  (rule) => rule.userId === member.id,
                );
                return (
                  <label
                    key={member.id}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-soft-kraft"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleMember(member.id)}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {member.name}
                    </span>
                    <span className="text-xs text-soft-ink">
                      {member.role}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <p className="text-xs leading-5 text-soft-ink">
            If no roles or members are selected, the document follows the
            workspace-level Documents permission. Once a rule is added, only
            matching users can open it.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isPending}>
            {isPending ? "Saving…" : "Save access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CategoryDialog({
  data,
  open,
  onOpenChange,
}: {
  data: DocumentHubData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  function addCategory() {
    setError(null);
    startTransition(async () => {
      const result = await createDocumentCategory({ name });
      if (!result.ok) {
        setError(result.error ?? "Could not create category.");
        return;
      }
      setName("");
      toast.success("Category created");
      router.refresh();
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Document categories</DialogTitle>
          <DialogDescription>
            Use a small, consistent vocabulary so filters stay useful as the
            workspace grows.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Employment agreement"
            />
            <Button onClick={addCategory} disabled={isPending || !name.trim()}>
              <Plus className="size-4" />
              Add
            </Button>
          </div>
          {error ? <Callout tone="danger">{error}</Callout> : null}
          <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-inner)] bg-card-inset">
            {data.categories.length === 0 ? (
              <p className="px-3 py-5 text-center text-sm text-soft-ink">
                No custom categories yet.
              </p>
            ) : (
              data.categories.map((category) => (
                <CategoryRow key={category.id} category={category} />
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryRow({ category }: { category: DocumentCategoryItem }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  function save() {
    startTransition(async () => {
      const result = await updateDocumentCategory({
        categoryId: category.id,
        name,
        accent: category.accent,
        active: category.active,
      });
      if (!result.ok) toast.error(result.error ?? "Could not update category.");
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className="size-2.5 rounded-full bg-near-ink" />
      {editing ? (
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-8"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm">{category.name}</span>
      )}
      <StatusPill tone={category.active ? "accent" : "neutral"}>
        {category.active ? "Active" : "Hidden"}
      </StatusPill>
      {editing ? (
        <Button size="sm" onClick={save} disabled={isPending}>
          Save
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
      )}
    </div>
  );
}
