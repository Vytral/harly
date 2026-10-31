"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  Check,
  Clock,
  Copy,
  Download,
  FileCheck2,
  History,
  LockKeyhole,
  Send,
  X,
} from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { createSignatureShareLink, remindSignatureRecipient } from "./actions";
import { SignatureTimeline } from "./SignatureTimeline";
import type { SignatureTimeline as Timeline } from "@/lib/esign/native/timeline";
import { formatDate } from "./DocumentShared";
import { RemoteSigningDisabledNote } from "./DocumentDetailDialogs";
import {
  SIGNATURE_STATUS_META,
  SIGNER_STATE_META,
  type DocumentHubData,
  type DocumentListItem,
  type DocumentSignatureDetail,
  type DocumentSignerItem,
} from "./shared";

const TONE_TO_PILL = {
  neutral: "neutral",
  success: "success",
  warning: "warning",
  danger: "danger",
} as const;

/** Remind / copy-link for native signers, with the busy state both buttons share. */
export function useSignerActions(document: DocumentListItem) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function remind(signer: DocumentSignerItem) {
    setBusyId(signer.id);
    startTransition(async () => {
      const result = await remindSignatureRecipient({
        documentId: document.id,
        recipientId: signer.id,
      });
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.error ?? "Could not send the reminder.");
        return;
      }
      toast.success(`Reminder sent to ${signer.email}`);
      router.refresh();
    });
  }

  async function copyLink(signer: DocumentSignerItem) {
    const ok = await confirm({
      tone: "warning",
      title: `Copy a new signing link for ${signer.name}?`,
      description:
        "Issuing a link replaces the one in their inbox. Share the new one yourself, or send a reminder instead.",
      confirmLabel: "Copy new link",
    });
    if (!ok) return;
    setBusyId(signer.id);
    const result = await createSignatureShareLink({
      documentId: document.id,
      recipientId: signer.id,
    });
    setBusyId(null);
    if (!result.ok || !result.url) {
      toast.error(result.error ?? "Could not create a signing link.");
      return;
    }
    try {
      await navigator.clipboard.writeText(result.url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy. Select the link from the prompt instead.", {
        description: result.url,
      });
    }
    router.refresh();
  }

  return { busyId, remind, copyLink };
}

function signerDetail(signer: DocumentSignerItem) {
  const parts: string[] = [];
  if (signer.state === "signed" && signer.signedAt) parts.push(`Signed ${formatDate(signer.signedAt)}`);
  else if (signer.state === "declined") {
    parts.push(signer.declinedAt ? `Declined ${formatDate(signer.declinedAt)}` : "Declined");
    if (signer.declinedReason) parts.push(signer.declinedReason);
  } else if (signer.state === "invited" || signer.state === "expired") {
    if (signer.invitedAt) parts.push(`Invited ${formatDate(signer.invitedAt)}`);
    if (signer.lastRemindedAt) parts.push(`Reminded ${formatDate(signer.lastRemindedAt)}`);
    if (signer.linkExpiresAt)
      parts.push(
        signer.state === "expired"
          ? `Expired ${formatDate(signer.linkExpiresAt)}`
          : `Link expires ${formatDate(signer.linkExpiresAt)}`,
      );
  }
  return parts.join(" · ");
}

function SignerRow({
  signer,
  canAct,
  busy,
  onRemind,
  onCopy,
  last,
}: {
  signer: DocumentSignerItem;
  canAct: boolean;
  busy: boolean;
  onRemind: () => void;
  onCopy: () => void;
  last: boolean;
}) {
  const meta = SIGNER_STATE_META[signer.state];
  const detail = signerDetail(signer);
  const done = signer.state === "signed";
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!last ? (
        <span aria-hidden="true" className="absolute top-7 bottom-0 left-[13px] w-px bg-hairline" />
      ) : null}
      <span
        aria-hidden="true"
        className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
          done
            ? "bg-near-ink text-pure-snow"
            : signer.state === "declined" || signer.state === "expired"
              ? "bg-danger-rust/10 text-danger-rust"
              : signer.state === "invited"
                ? "bg-lime-wash text-near-ink ring-1 ring-near-ink/20"
                : "bg-card-inset text-soft-ink"
        }`}
      >
        {done ? <Check className="size-3.5" /> : signer.state === "declined" ? <X className="size-3.5" /> : signer.order}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="min-w-0 truncate text-[13.5px] font-medium text-near-ink">{signer.name}</p>
          <StatusPill size="sm" tone={TONE_TO_PILL[meta.tone]}>
            {meta.label}
          </StatusPill>
        </div>
        <p className="truncate text-[12.5px] text-soft-ink">{signer.email}</p>
        {detail ? <p className="text-[12px] leading-snug text-soft-ink">{detail}</p> : null}
        {canAct && signer.state === "invited" ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Button size="xs" variant="outline" disabled={busy} onClick={onRemind}>
              <BellRing />
              Remind
            </Button>
            <Button size="xs" variant="outline" disabled={busy} onClick={onCopy}>
              <Copy />
              Copy link
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function SignatureStatusCard({
  data,
  document,
  signature,
  canManage,
  archived,
  onSendNative,
  onSendDocuSeal,
  onVoid,
  onRecordOffline,
  onSignNow,
  timeline,
}: {
  data: DocumentHubData;
  document: DocumentListItem;
  signature: DocumentSignatureDetail | null;
  canManage: boolean;
  archived: boolean;
  onSendNative: () => void;
  onSendDocuSeal: () => void;
  onVoid: () => void;
  onRecordOffline: () => void;
  /** Readable signing timeline; only loaded when the workspace turns it on. */
  timeline?: Timeline | null;
  onSignNow: () => void;
}) {
  const actions = useSignerActions(document);
  const meta = SIGNATURE_STATUS_META[document.signatureStatus] ?? SIGNATURE_STATUS_META.unsigned;
  const status = document.signatureStatus;
  const provider = document.signatureProvider;
  const isNative = provider === "native";
  const isPdf = document.mimeType === "application/pdf";
  const inFlight = status === "pending";
  const signers = signature?.signers ?? [];
  const canStart = canManage && !archived && (status === "unsigned" || status === "declined" || status === "expired");
  const signed = status === "signed";
  const tone = status === "signed" ? "success" : status === "pending" ? "warning" : status === "unsigned" ? "neutral" : "danger";

  return (
    <Card data-slot="signature-status-card" className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <LockKeyhole className="size-4 text-soft-ink" />
            Signature
          </span>
          <StatusPill size="sm" tone={TONE_TO_PILL[tone]}>
            {meta.label}
          </StatusPill>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "unsigned" ? (
          <p className="text-[13px] leading-5 text-soft-ink">
            Not signed yet. Send it to one or more signers, or sign it yourself.
          </p>
        ) : null}
        {status === "declined" || status === "expired" ? (
          <Callout tone="danger" title={status === "declined" ? "The signature request was declined or cancelled." : "The signature request expired."}>
            You can send it again.
          </Callout>
        ) : null}

        {signers.length > 0 ? (
          <ol aria-label="Signers" className="space-y-0">
            {signers.map((signer, index) => (
              <SignerRow
                key={signer.id}
                signer={signer}
                canAct={canManage && !archived && isNative && inFlight}
                busy={actions.busyId === signer.id}
                onRemind={() => actions.remind(signer)}
                onCopy={() => void actions.copyLink(signer)}
                last={index === signers.length - 1}
              />
            ))}
          </ol>
        ) : inFlight ? (
          <p className="flex items-start gap-2 text-[13px] leading-5 text-soft-ink">
            <Clock className="mt-0.5 size-4 shrink-0" />
            Waiting for the signer. Progress appears here once the signing provider reports back.
          </p>
        ) : null}

        {signed ? (
          <div className="space-y-2">
            {signature?.completedAt ? (
              <p className="text-[13px] text-soft-ink">Completed {formatDate(signature.completedAt)}.</p>
            ) : null}
            {document.manualSignatureNote ? (
              <Callout tone="warning" title="Recorded offline">
                {document.manualSignatureNote}
                <span className="mt-1 block text-[12px] text-soft-ink">
                  {document.manualSignedByName ?? "A manager"}
                  {document.manualSignedAt ? ` · ${formatDate(document.manualSignedAt)}` : ""}
                </span>
              </Callout>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={`/api/documents/${document.id}?download=1`}>
                  <Download />
                  Signed PDF
                </a>
              </Button>
              {signature?.certificateArtifactId ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={`/api/documents/${document.id}/evidence/${signature.certificateArtifactId}`}>
                    <FileCheck2 />
                    Certificate
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {document.signatureUrl ? (
          <a
            href={document.signatureUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-[13px] font-medium text-near-ink underline underline-offset-2"
          >
            Open DocuSeal submission
          </a>
        ) : null}

        {canManage && !archived ? (
          <div className="flex flex-wrap gap-2">
            {canStart && isPdf ? (
              <Button size="sm" variant="outline" onClick={onSignNow}>
                <LockKeyhole />
                Sign myself
              </Button>
            ) : null}
            {canStart && data.remoteSignEnabled ? (
              <Button size="sm" onClick={onSendNative}>
                <Send />
                Send for signature
              </Button>
            ) : null}
            {canStart && data.esign.connected ? (
              <Button size="sm" variant={data.remoteSignEnabled ? "outline" : "default"} onClick={onSendDocuSeal}>
                <Send />
                Send with DocuSeal
              </Button>
            ) : null}
            {inFlight && (provider === "native" || provider === "docuseal") ? (
              <Button size="sm" variant="outline" onClick={onVoid}>
                Void request
              </Button>
            ) : null}
            {status === "unsigned" || status === "declined" || status === "expired" ? (
              <Button size="sm" variant="ghost" onClick={onRecordOffline}>
                Record offline signature
              </Button>
            ) : null}
          </div>
        ) : null}
        {canStart && !data.remoteSignEnabled ? <RemoteSigningDisabledNote /> : null}

        {timeline && timeline.entries.length > 0 ? <SignatureTimeline timeline={timeline} /> : null}

        {signature || signed || inFlight ? (
          <a
            href={`/api/documents/${document.id}/evidence`}
            className="flex w-fit items-center gap-1.5 text-[12.5px] text-soft-ink underline-offset-2 hover:text-near-ink hover:underline"
          >
            <History className="size-3.5" />
            Download audit trail
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}
