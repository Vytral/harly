"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("features.documents.sendForSignatureDialog");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [subject, setSubject] = useState(
    t("defaultSubject", { name: document.name }),
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setEmail("");
    setRecipientName("");
    setSubject(t("defaultSubject", { name: document.name }));
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
        setError(result.error ?? t("fallbackError"));
        return;
      }
      toast.success(t("sent"));
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
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>
        {!connected ? (
          <Callout tone="warning" className="my-2">
            {data.esign.connected ? t("missingWebhookSecret") : t("notConnected")}
          </Callout>
        ) : (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="signer-email">{t("recipientEmailLabel")}</Label>
                <Input
                  id="signer-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t("recipientEmailPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signer-name">{t("recipientNameLabel")}</Label>
                <Input
                  id="signer-name"
                  value={recipientName}
                  onChange={(event) => setRecipientName(event.target.value)}
                  placeholder={t("recipientNamePlaceholder")}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="signer-subject">{t("subjectLabel")}</Label>
              <Input
                id="signer-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signer-message">{t("messageLabel")}</Label>
              <Textarea
                id="signer-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={3}
                placeholder={t("messagePlaceholder")}
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
            {t("cancel")}
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
            {isPending ? t("sending") : t("send")}
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
  const t = useTranslations("features.documents.voidSignatureDialog");
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
        setError(result.error ?? t("fallbackError"));
        return;
      }
      toast.success(t("voided"));
      setReason("");
      onOpenChange(false);
      router.refresh();
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {signedCount > 0 && document.signatureProvider === "native" ? (
            <Callout tone="warning">
              {t("signedWarning", { count: signedCount })}
            </Callout>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="void-reason">{t("reasonLabel")}</Label>
            <Textarea
              id="void-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              placeholder={t("reasonPlaceholder")}
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
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={isPending || reason.trim().length < 3}
          >
            {isPending ? t("voiding") : t("submit")}
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
  const t = useTranslations("features.documents.legalHoldDialog");
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
        toast.error(result.error ?? t("fallbackError"));
        return;
      }
      toast.success(releasing ? t("released") : t("placed"));
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
            {releasing ? t("releaseTitle") : t("placeTitle")}
          </DialogTitle>
          <DialogDescription>
            {releasing ? t("releaseDescription") : t("placeDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="legal-hold-reason">
              {releasing ? t("releaseReasonLabel") : t("reasonLabel")}
            </Label>
            <Textarea
              id="legal-hold-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              placeholder={
                releasing
                  ? t("releaseReasonPlaceholder")
                  : t("reasonPlaceholder")
              }
            />
          </div>
          {!releasing ? (
            <div className="space-y-2">
              <Label htmlFor="legal-hold-reference">{t("referenceLabel")}</Label>
              <Input
                id="legal-hold-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder={t("referencePlaceholder")}
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={submit}
            disabled={isPending || reason.trim().length < 3}
          >
            {isPending ? t("saving") : releasing ? t("release") : t("place")}
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
  const t = useTranslations("features.documents.renameDialog");
  const router = useRouter();
  const [name, setName] = useState(document.name);
  const [isPending, startTransition] = useTransition();
  function submit() {
    startTransition(async () => {
      const result = await renameDocument({ documentId: document.id, name });
      if (!result.ok) {
        toast.error(result.error ?? t("fallbackError"));
        return;
      }
      toast.success(t("renamed"));
      onOpenChange(false);
      router.refresh();
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <Input
          value={name}
          aria-label={t("nameAriaLabel")}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && name.trim() && !isPending) submit();
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={!name.trim() || isPending}>
            {isPending ? t("saving") : t("save")}
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
  const t = useTranslations("features.documents.recordOfflineSignatureDialog");
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
        toast.error(result.error ?? t("fallbackError"));
        return;
      }
      toast.success(t("recorded"));
      setNote("");
      onOpenChange(false);
      router.refresh();
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="attest-note">{t("noteLabel")}</Label>
          <Textarea
            id="attest-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder={t("notePlaceholder")}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={note.trim().length < 3 || isPending}>
            {isPending ? t("saving") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Settings pointer shown when remote signing links are switched off. */
export function RemoteSigningDisabledNote() {
  const t = useTranslations("features.documents.remoteSigningDisabledNote");
  return (
    <Callout tone="info">
      {t.rich("message", {
        link: (chunks) => (
          <Link
            href="/settings/signature"
            className="font-medium text-near-ink underline underline-offset-2"
          >
            {chunks}
          </Link>
        ),
      })}
    </Callout>
  );
}
