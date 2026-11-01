"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
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
import {
  placeDocumentLegalHold,
  releaseDocumentLegalHold,
  renameDocument,
  saveDocumentSignature,
  sendDocumentForSignature,
  voidDocumentSignature,
} from "./actions";
import type { DocumentHubData, DocumentListItem } from "./shared";

export function SendForSignatureDialog({
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
          <DialogTitle>Send with DocuSeal</DialogTitle>
          <DialogDescription>
            DocuSeal emails the recipient, whether or not they&apos;re a
            candidate on file. The signed PDF and audit log return to this
            workspace automatically.
          </DialogDescription>
        </DialogHeader>
        {!connected ? (
          <Callout tone="warning" className="my-2">
            DocuSeal is{" "}
            {data.esign.connected
              ? "connected but missing its webhook secret"
              : "not connected"}
            . Finish setup in Settings → Integrations before sending for
            signature.
          </Callout>
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
              <Textarea
                id="signer-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={3}
                placeholder="Add a short note for the signer…"
              />
            </div>
            {error ? <Callout tone="danger">{error}</Callout> : null}
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

export function VoidSignatureDialog({
  document,
  signedCount,
  open,
  onOpenChange,
}: {
  document: DocumentListItem;
  /** Signers who already signed; their marks are discarded with the request. */
  signedCount: number;
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
            This cancels the signing request. Recipients can no longer sign it,
            and the original document is left unsigned.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {signedCount > 0 && document.signatureProvider === "native" ? (
            <Callout tone="warning">
              {signedCount === 1 ? "One signer has" : `${signedCount} signers have`}{" "}
              already signed. Voiding discards their signatures, and you will
              need to start over.
            </Callout>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="void-reason">Reason</Label>
            <Textarea
              id="void-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              placeholder="Recipient email was wrong…"
            />
          </div>
          {error ? <Callout tone="danger">{error}</Callout> : null}
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

export function LegalHoldDialog({
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
            <Textarea
              id="legal-hold-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
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

export function RenameDialog({
  document,
  open,
  onOpenChange,
}: {
  document: DocumentListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(document.name);
  const [isPending, startTransition] = useTransition();
  function submit() {
    startTransition(async () => {
      const result = await renameDocument({ documentId: document.id, name });
      if (!result.ok) {
        toast.error(result.error ?? "Could not rename the document.");
        return;
      }
      toast.success("Name updated");
      onOpenChange(false);
      router.refresh();
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename document</DialogTitle>
          <DialogDescription>This changes metadata only.</DialogDescription>
        </DialogHeader>
        <Input
          value={name}
          aria-label="Document name"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && name.trim() && !isPending) submit();
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || isPending}>
            {isPending ? "Saving…" : "Save name"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Manual attestation: the only way to mark a document signed by hand. */
export function RecordOfflineSignatureDialog({
  document,
  open,
  onOpenChange,
}: {
  document: DocumentListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  function submit() {
    startTransition(async () => {
      const result = await saveDocumentSignature({
        documentId: document.id,
        status: "signed",
        provider: document.signatureProvider,
        envelopeId: document.signatureEnvelopeId,
        url: document.signatureUrl,
        expiresAt: document.expiresAt,
        attestationNote: note,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not record the signature.");
        return;
      }
      toast.success("Signature recorded");
      setNote("");
      onOpenChange(false);
      router.refresh();
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a signature collected offline</DialogTitle>
          <DialogDescription>
            Use this when the document was signed outside Harly, for example in
            person. It is saved as your attestation, not verified evidence, and
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="attest-note">How and when was it signed?</Label>
          <Textarea
            id="attest-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="Signed in person on 4 March, scan saved in the candidate file."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={note.trim().length < 3 || isPending}>
            {isPending ? "Saving…" : "Mark as signed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Settings pointer shown when remote signing links are switched off. */
export function RemoteSigningDisabledNote() {
  return (
    <Callout tone="info">
      Remote signing links are off.{" "}
      <Link
        href="/settings/signature"
        className="font-medium text-near-ink underline underline-offset-2"
      >
        Enable them in Signature settings
      </Link>
      .
    </Callout>
  );
}
