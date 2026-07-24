"use client";

/* eslint-disable @next/next/no-img-element */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  Download,
  FileArchive,
  FileImage,
  FileText,
  FolderCog,
  Gavel,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { DocxViewer } from "@/features/candidates/DocxViewer";
import { PdfViewer } from "@/features/candidates/PdfViewer";
import {
  assignDocument,
  deleteDocument,
  placeDocumentLegalHold,
  releaseDocumentLegalHold,
  renameDocument,
  saveDocumentSignature,
  sendDocumentForSignature,
  setDocumentCategory,
  setDocumentExpiresAt,
  setDocumentStatus,
  voidDocumentSignature,
} from "./actions";
import { sendDocumentForNativeSignature } from "./native-sign-actions";
import {
  AccessDialog,
  StatusPill,
  UploadDialog,
  formatActivityType,
  formatDate,
} from "./DocumentShared";
import {
  DOCUMENT_STATUS_META,
  SIGNATURE_STATUS_META,
  documentTypeLabel,
  formatDocumentSize,
  isPreviewable,
  type DocumentHubData,
  type DocumentListItem,
} from "./shared";

function DocumentPreview({ document }: { document: DocumentListItem }) {
  const url = `/api/documents/${document.id}`;
  if (document.mimeType === "application/pdf")
    return (
      <PdfViewer
        fileUrl={url}
        fileName={document.name}
        className="min-h-[70vh]"
      />
    );
  if (
    document.mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return <DocxViewer fileUrl={url} className="min-h-[70vh]" />;
  if (document.mimeType.startsWith("image/"))
    return (
      <div className="flex min-h-[70vh] items-center justify-center rounded-lg border bg-muted/20 p-4">
        <img
          src={url}
          alt={document.name}
          className="max-h-[70vh] max-w-full rounded-md object-contain"
        />
      </div>
    );
  return (
    <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
      Preview is not available for this file type.
    </div>
  );
}

function SendForSignatureDialog({
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
  const [email, setEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [subject, setSubject] = useState(`Please sign: ${document.name}`);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setEmail("");
    setRecipientName("");
    setSubject(`Please sign: ${document.name}`);
    setMessage("");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await sendDocumentForSignature({
        documentId: document.id,
        recipientEmail: email,
        recipientName,
        subject,
        message: message.trim() || null,
      });
      if (!result.ok) {
        setError(result.error ?? "Could not send for signature.");
        return;
      }
      toast.success("Sent for signature");
      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  const connected = data.esign.connected && data.esign.hasWebhookSecret;

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
          <DialogTitle>Send for signature</DialogTitle>
          <DialogDescription>
            DocuSeal emails the recipient — any email address, whether or not
            they&apos;re a candidate on file. The signed PDF and audit log
            return to this workspace automatically.
          </DialogDescription>
        </DialogHeader>
        {!connected ? (
          <div className="space-y-3 py-2">
            <p className="rounded-md border border-warning/30 bg-warning/[0.06] px-3 py-3 text-sm text-warning">
              DocuSeal is{" "}
              {data.esign.connected
                ? "connected but missing its webhook secret"
                : "not connected"}
              . Finish setup in Settings → Integrations before sending for
              signature.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="signer-email">Recipient email</Label>
                <Input
                  id="signer-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="taylor@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signer-name">Recipient name</Label>
                <Input
                  id="signer-name"
                  value={recipientName}
                  onChange={(event) => setRecipientName(event.target.value)}
                  placeholder="Taylor Okafor"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="signer-subject">Email subject</Label>
              <Input
                id="signer-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signer-message">Message (optional)</Label>
              <textarea
                id="signer-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Add a short note for the signer…"
              />
            </div>
            {error ? (
              <p
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              !connected ||
              isPending ||
              !email.trim() ||
              !recipientName.trim() ||
              !subject.trim()
            }
          >
            <Send className="size-4" />
            {isPending ? "Sending…" : "Send for signature"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NativeSendForSignatureDialog({
  document,
  open,
  onOpenChange,
}: {
  document: DocumentListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  function submit() {
    startTransition(async () => {
      const result = await sendDocumentForNativeSignature({
        documentId: document.id,
        recipientEmail: email,
        recipientName: name,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Native signing link sent");
      setEmail("");
      setName("");
      onOpenChange(false);
      router.refresh();
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send with Harly Signature</DialogTitle>
          <DialogDescription>
            Send a secure signing link to any email address — a candidate, a
            hiring manager, or anyone else. The workspace security setting
            controls whether email OTP is required.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="native-recipient-email">Recipient email</Label>
            <Input
              id="native-recipient-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="native-recipient-name">Recipient name</Label>
            <Input
              id="native-recipient-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !email.trim() || !name.trim()}
          >
            {pending ? "Sending…" : "Send signing link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VoidSignatureDialog({
  document,
  open,
  onOpenChange,
}: {
  document: DocumentListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await voidDocumentSignature({
        documentId: document.id,
        reason,
      });
      if (!result.ok) {
        setError(result.error ?? "Could not void the request.");
        return;
      }
      toast.success("Signature request voided");
      setReason("");
      onOpenChange(false);
      router.refresh();
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void signature request</DialogTitle>
          <DialogDescription>
            This cancels the DocuSeal submission. The recipient can no longer
            sign it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="void-reason">Reason</Label>
            <textarea
              id="void-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Recipient email was wrong…"
            />
          </div>
          {error ? (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={isPending || reason.trim().length < 3}
          >
            {isPending ? "Voiding…" : "Void request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LegalHoldDialog({
  document,
  open,
  onOpenChange,
  activeHold,
}: {
  document: DocumentListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeHold: DocumentListItem["legalHolds"][number] | null;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [isPending, startTransition] = useTransition();
  const releasing = Boolean(activeHold);

  function submit() {
    startTransition(async () => {
      const result = releasing
        ? await releaseDocumentLegalHold({
            holdId: activeHold!.id,
            releaseReason: reason,
          })
        : await placeDocumentLegalHold({
            documentId: document.id,
            reason,
            reference: reference || null,
          });
      if (!result.ok) {
        toast.error(result.error ?? "Could not update legal hold.");
        return;
      }
      toast.success(releasing ? "Legal hold released" : "Legal hold placed");
      setReason("");
      setReference("");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {releasing ? "Release legal hold" : "Place legal hold"}
          </DialogTitle>
          <DialogDescription>
            {releasing
              ? "Record why this hold is being released. Other active holds, if any, remain in force."
              : "This protects the document from archival until every active hold is released."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="legal-hold-reason">
              {releasing ? "Release reason" : "Reason"}
            </Label>
            <textarea
              id="legal-hold-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={
                releasing
                  ? "Investigation closed…"
                  : "Active litigation, audit, or preservation notice…"
              }
            />
          </div>
          {!releasing ? (
            <div className="space-y-2">
              <Label htmlFor="legal-hold-reference">Reference (optional)</Label>
              <Input
                id="legal-hold-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Matter, ticket, or case reference"
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={isPending || reason.trim().length < 3}
          >
            {isPending ? "Saving…" : releasing ? "Release hold" : "Place hold"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpiresAtField({
  document,
  editable,
}: {
  document: DocumentListItem;
  editable: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(
    document.expiresAt ? document.expiresAt.slice(0, 10) : "",
  );
  const [isPending, startTransition] = useTransition();
  const dirty = value !== (document.expiresAt ? document.expiresAt.slice(0, 10) : "");
  function save() {
    startTransition(async () => {
      const result = await setDocumentExpiresAt({
        documentId: document.id,
        expiresAt: value || null,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save the date.");
        return;
      }
      toast.success(value ? "Date saved" : "Date cleared");
      router.refresh();
    });
  }
  return (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        value={value}
        disabled={!editable || isPending}
        onChange={(event) => setValue(event.target.value)}
        className="h-8 w-40"
      />
      {dirty ? (
        <Button size="sm" variant="outline" onClick={save} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      ) : null}
    </div>
  );
}

export function DocumentDetailView({
  data,
  document,
}: {
  data: DocumentHubData;
  document: DocumentListItem;
}) {
  const router = useRouter();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [sendSignOpen, setSendSignOpen] = useState(false);
  const [nativeSendOpen, setNativeSendOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [attestOpen, setAttestOpen] = useState(false);
  const [attestNote, setAttestNote] = useState("");
  const [nextName, setNextName] = useState(document.name);
  const [isPending, startTransition] = useTransition();

  const status =
    DOCUMENT_STATUS_META[document.status] ?? DOCUMENT_STATUS_META.active;
  const signature =
    SIGNATURE_STATUS_META[document.signatureStatus] ??
    SIGNATURE_STATUS_META.unsigned;
  const isArchived = document.status === "archived";
  const Icon = document.mimeType.startsWith("image/")
    ? FileImage
    : document.mimeType === "application/pdf" || document.mimeType.includes("word")
      ? FileText
      : FileArchive;
  const activeHolds = document.legalHolds.filter((hold) => !hold.releasedAt);
  const activeHold = activeHolds[0] ?? null;

  // A user can have the org-wide "manage documents" permission yet still be
  // narrowed out of THIS document by an explicit ACL rule — surface that
  // distinction instead of letting mutation actions fail with a vague error.
  const restrictedByAcl = data.canManage && document.currentAccessLevel !== "manage";
  const canManageThis = data.canManage && document.currentAccessLevel === "manage";
  // Terminal-but-retryable states: a declined or expired request should still
  // let the sender try again, not dead-end with no send controls at all.
  const canSendForSignature =
    document.signatureStatus === "unsigned" ||
    document.signatureStatus === "declined" ||
    document.signatureStatus === "expired";

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? "Could not update document.");
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }
  function rename() {
    run(
      () => renameDocument({ documentId: document.id, name: nextName }),
      "Name updated",
    );
    setRenameOpen(false);
  }
  const assignmentFor = (assignmentType: "owner" | "reviewer") =>
    document.assignments.find(
      (assignment) => assignment.assignmentType === assignmentType,
    )?.userId ?? "";
  const submitSignatureStatus = (
    nextStatus: keyof typeof SIGNATURE_STATUS_META,
    attestationNote?: string,
  ) =>
    run(
      () =>
        saveDocumentSignature({
          documentId: document.id,
          status: nextStatus,
          provider: document.signatureProvider,
          envelopeId: document.signatureEnvelopeId,
          url: document.signatureUrl,
          expiresAt: document.expiresAt,
          attestationNote,
        }),
      "Signature status updated",
    );
  const saveSignatureStatus = (
    nextStatus: keyof typeof SIGNATURE_STATUS_META,
  ) => {
    if (nextStatus === "signed") {
      setAttestNote("");
      setAttestOpen(true);
      return;
    }
    submitSignatureStatus(nextStatus);
  };
  function confirmAttestation() {
    submitSignatureStatus("signed", attestNote);
    setAttestOpen(false);
  }
  function deleteCurrentDocument() {
    if (
      !data.canDelete ||
      !window.confirm(
        `Permanently delete “${document.name}”? This cannot be undone.`,
      )
    )
      return;
    startTransition(async () => {
      const result = await deleteDocument({ documentId: document.id });
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete document.");
        return;
      }
      toast.success("Document deleted");
      router.push("/dashboard/documents");
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-5">
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="break-words font-display text-xl font-semibold tracking-tight">
                {document.name}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {documentTypeLabel(document.mimeType)} ·{" "}
                {formatDocumentSize(document.sizeBytes)} · v
                {document.currentVersion}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <StatusPill className={status.className}>{status.label}</StatusPill>
                <StatusPill className={signature.className}>
                  {signature.label}
                </StatusPill>
                {document.category ? (
                  <StatusPill className="bg-muted text-muted-foreground">
                    {document.category.name}
                  </StatusPill>
                ) : null}
              </div>
            </div>
          </div>

          {restrictedByAcl ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/[0.06] px-3 py-2.5 text-sm text-warning">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <p>
                An access rule restricts this document to specific people —
                you have read-only access here, so management actions are
                unavailable even though you can manage documents generally.
              </p>
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-border/70 pt-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Association</p>
              <p className="mt-1 font-medium">
                {document.associationLabels.join(" · ") || "Workspace"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Owner</p>
              <div className="mt-1 flex items-center gap-2">
                {document.ownerId ? (
                  <>
                    <UserAvatar
                      name={document.ownerName ?? "Workspace"}
                      src={document.ownerImage}
                      size="sm"
                    />
                    <span className="truncate font-medium">
                      {document.ownerName}
                    </span>
                  </>
                ) : (
                  <span className="font-medium">Workspace</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Updated</p>
              <p className="mt-1 font-medium">{formatDate(document.updatedAt)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Versions</p>
              <p className="mt-1 font-medium">{document.versionCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Checksum</p>
              <p
                className="mt-1 truncate font-mono text-[11px]"
                title={document.checksum}
              >
                {document.checksum.slice(0, 12)}…
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarClock className="size-3.5" />
                Effective / expiration date
              </p>
              <div className="mt-1">
                <ExpiresAtField
                  document={document}
                  editable={canManageThis && !isArchived}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Preview</p>
            <Button
              size="sm"
              variant="outline"
              disabled={!isPreviewable(document.mimeType)}
              onClick={() => setPreviewOpen((current) => !current)}
            >
              <FileText className="size-4" />
              {previewOpen ? "Hide preview" : "Show preview"}
            </Button>
          </div>
          {previewOpen ? (
            <DocumentPreview document={document} />
          ) : (
            <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              {isPreviewable(document.mimeType)
                ? "Preview hidden — click Show preview to load it."
                : "Preview is not available for this file type."}
            </div>
          )}
        </div>

        {document.activity.length > 0 ? (
          <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
            <p className="mb-3 text-sm font-semibold">Recent activity</p>
            <div className="divide-y divide-border/70">
              {document.activity.map((event) => (
                <div key={event.id} className="py-2.5 text-sm first:pt-0 last:pb-0">
                  <p className="capitalize">{formatActivityType(event.type)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {event.actorName ?? "System"} ·{" "}
                    {formatDate(event.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-5">
        <div className="space-y-2 rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Actions
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/documents/${document.id}?download=1`}>
                <Download className="size-4" />
                Download
              </a>
            </Button>
            {canManageThis ? (
              <Button
                size="sm"
                variant="outline"
                disabled={isArchived}
                onClick={() => setRenameOpen(true)}
              >
                Rename
              </Button>
            ) : null}
            {canManageThis ? (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() =>
                  run(
                    () =>
                      setDocumentStatus({
                        documentId: document.id,
                        status:
                          document.status === "archived"
                            ? "active"
                            : "archived",
                      }),
                    document.status === "archived"
                      ? "Document restored"
                      : "Document archived",
                  )
                }
              >
                {document.status === "archived" ? (
                  <ArchiveRestore className="size-4" />
                ) : (
                  <Archive className="size-4" />
                )}
                {document.status === "archived" ? "Restore" : "Archive"}
              </Button>
            ) : null}
            {canManageThis ? (
              <Button
                size="sm"
                variant="outline"
                disabled={
                  isArchived ||
                  isPending ||
                  document.signatureStatus === "signed" ||
                  document.signatureStatus === "pending"
                }
                onClick={() => setVersionOpen(true)}
              >
                New version
              </Button>
            ) : null}
            {data.canDelete ? (
              <Button
                size="sm"
                variant="destructive"
                disabled={isPending}
                onClick={deleteCurrentDocument}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2 rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Category
            </p>
            <FolderCog className="size-4 text-muted-foreground" />
          </div>
          <select
            value={document.category?.id ?? ""}
            disabled={!canManageThis || isArchived}
            onChange={(event) =>
              run(
                () =>
                  setDocumentCategory({
                    documentId: document.id,
                    categoryId: event.target.value || null,
                  }),
                "Category updated",
              )
            }
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">No category</option>
            {data.categories
              .filter((category) => category.active)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
        </div>

        <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Assignments
          </p>
          {(["owner", "reviewer"] as const).map((assignmentType) => (
            <label key={assignmentType} className="block space-y-1.5">
              <span className="text-sm font-medium">
                {assignmentType === "owner" ? "Responsible" : "Reviewer"}
              </span>
              <select
                value={assignmentFor(assignmentType)}
                disabled={!canManageThis || isArchived || isPending}
                onChange={(event) =>
                  run(
                    () =>
                      assignDocument({
                        documentId: document.id,
                        userId: event.target.value || null,
                        assignmentType,
                      }),
                    `${assignmentType === "owner" ? "Responsible" : "Reviewer"} updated`,
                  )
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Not assigned</option>
                {data.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="space-y-2 rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Access & ownership
          </p>
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
            <p className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              {document.accessRoles.length + document.accessMembers.length === 0
                ? "Workspace permission"
                : `${document.accessRoles.length + document.accessMembers.length} explicit rule${document.accessRoles.length + document.accessMembers.length === 1 ? "" : "s"}`}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Owner and workspace admins retain access. ACL rules can narrow
              access for everyone else.
            </p>
          </div>
          {data.canShare ? (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={isArchived}
              onClick={() => setAccessOpen(true)}
            >
              <Users className="size-4" />
              Manage access
            </Button>
          ) : null}
        </div>

        <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Signature
            </p>
            <LockKeyhole className="size-4 text-muted-foreground" />
          </div>
          <select
            value={document.signatureStatus}
            disabled={!canManageThis || isArchived || isPending}
            onChange={(event) =>
              saveSignatureStatus(
                event.target.value as keyof typeof SIGNATURE_STATUS_META,
              )
            }
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {Object.entries(SIGNATURE_STATUS_META).map(([key, item]) => (
              <option key={key} value={key}>
                {item.label}
              </option>
            ))}
          </select>
          <div className="rounded-xl border border-border/70 p-3 text-sm">
            <p className="flex items-center gap-2">
              <LockKeyhole className="size-4 text-muted-foreground" />
              {signature.label}
            </p>
            {document.signatureProvider ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {document.signatureProvider}
              </p>
            ) : null}
            {document.signatureUrl ? (
              <a
                href={document.signatureUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                Open DocuSeal submission
              </a>
            ) : null}
            {document.manualSignatureNote ? (
              <div className="mt-2 rounded-md bg-warning/10 p-2 text-xs text-warning">
                <p className="font-medium">Manual attestation</p>
                <p className="mt-0.5 leading-5">
                  {document.manualSignatureNote}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {document.manualSignedByName ?? "A manager"} ·{" "}
                  {document.manualSignedAt
                    ? formatDate(document.manualSignedAt)
                    : ""}
                </p>
              </div>
            ) : null}
          </div>
          {canManageThis ? (
            <div className="grid gap-2">
              <Button
                disabled={
                  isArchived ||
                  document.status !== "active" ||
                  document.signatureStatus !== "unsigned" ||
                  document.mimeType !== "application/pdf"
                }
                onClick={() =>
                  window.location.assign(
                    `/dashboard/documents/${document.id}/sign`,
                  )
                }
              >
                <LockKeyhole className="size-4" />
                Sign now
              </Button>
              {document.signatureStatus === "pending" &&
              document.signatureProvider === "docuseal" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isArchived}
                  onClick={() => setVoidOpen(true)}
                >
                  <LockKeyhole className="size-4" />
                  Void request
                </Button>
              ) : canSendForSignature ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isArchived}
                    onClick={() => setNativeSendOpen(true)}
                  >
                    <LockKeyhole className="size-4" />
                    Native link
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isArchived}
                    onClick={() => setSendSignOpen(true)}
                  >
                    <Send className="size-4" />
                    DocuSeal
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Gavel className="size-4" />
              Governance
            </p>
            {activeHolds.length > 0 ? (
              <StatusPill className="bg-warning/10 text-warning">
                {activeHolds.length} active hold
                {activeHolds.length === 1 ? "" : "s"}
              </StatusPill>
            ) : null}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Preservation notices and signed evidence remain workspace-scoped
            and ACL-protected.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/documents/${document.id}/evidence`}>
                <Download className="size-4" />
                Export evidence
              </a>
            </Button>
            {canManageThis ? (
              <Button
                size="sm"
                variant="outline"
                disabled={document.status === "archived" && !activeHold}
                onClick={() => setHoldOpen(true)}
              >
                <Gavel className="size-4" />
                {activeHold ? "Release legal hold" : "Place legal hold"}
              </Button>
            ) : null}
          </div>
          {activeHolds.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-warning/30 bg-warning/[0.04] p-3 text-sm">
              <p className="font-medium text-warning">
                This document is preserved.
              </p>
              {activeHolds.map((hold) => (
                <div
                  key={hold.id}
                  className="border-t border-warning/20 pt-2 text-xs leading-5 text-warning/80"
                >
                  <p>{hold.reason}</p>
                  {hold.reference ? (
                    <p className="mt-0.5">Reference: {hold.reference}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
            <DialogDescription>This changes metadata only.</DialogDescription>
          </DialogHeader>
          <Input
            value={nextName}
            onChange={(event) => setNextName(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={rename} disabled={!nextName.trim() || isPending}>
              Save name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AccessDialog
        data={data}
        document={document}
        open={accessOpen}
        onOpenChange={setAccessOpen}
      />
      <UploadDialog
        data={data}
        open={versionOpen}
        onOpenChange={setVersionOpen}
        replaceDocument={document}
      />
      <SendForSignatureDialog
        data={data}
        document={document}
        open={sendSignOpen}
        onOpenChange={setSendSignOpen}
      />
      <NativeSendForSignatureDialog
        document={document}
        open={nativeSendOpen}
        onOpenChange={setNativeSendOpen}
      />
      <VoidSignatureDialog
        document={document}
        open={voidOpen}
        onOpenChange={setVoidOpen}
      />
      <LegalHoldDialog
        document={document}
        activeHold={activeHold}
        open={holdOpen}
        onOpenChange={setHoldOpen}
      />
      <Dialog open={attestOpen} onOpenChange={setAttestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record manual signature</DialogTitle>
            <DialogDescription>
              Describe how and when it was signed.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={attestNote}
            onChange={(event) => setAttestNote(event.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttestOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmAttestation}
              disabled={attestNote.trim().length < 3 || isPending}
            >
              Confirm signed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
