"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
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

type Translator = ReturnType<typeof useTranslations>;

/** Remind / copy-link for native signers, with the busy state both buttons share. */
export function useSignerActions(document: DocumentListItem) {
  const router = useRouter();
  const confirm = useConfirm();
  const t = useTranslations("features.documents.signatureStatusCard");
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
        toast.error(result.error ?? t("reminderFailed"));
        return;
      }
      toast.success(t("reminderSent", { email: signer.email }));
      router.refresh();
    });
  }

  async function copyLink(signer: DocumentSignerItem) {
    const ok = await confirm({
      tone: "warning",
      title: t("copyLinkTitle", { name: signer.name }),
      description: t("copyLinkDescription"),
      confirmLabel: t("copyLinkConfirm"),
    });
    if (!ok) return;
    setBusyId(signer.id);
    const result = await createSignatureShareLink({
      documentId: document.id,
      recipientId: signer.id,
    });
    setBusyId(null);
    if (!result.ok || !result.url) {
      toast.error(result.error ?? t("linkFailed"));
      return;
    }
    try {
      await navigator.clipboard.writeText(result.url);
      toast.success(t("linkCopied"));
    } catch {
      toast.error(t("copyFailed"), {
        description: result.url,
      });
    }
    router.refresh();
  }

  return { busyId, remind, copyLink };
}

function signerDetail(t: Translator, signer: DocumentSignerItem, locale: string) {
  const parts: string[] = [];
  if (signer.state === "signed" && signer.signedAt) parts.push(t("signedOn", { date: formatDate(signer.signedAt, locale) }));
  else if (signer.state === "declined") {
    parts.push(signer.declinedAt ? t("declinedOn", { date: formatDate(signer.declinedAt, locale) }) : t("declined"));
    if (signer.declinedReason) parts.push(signer.declinedReason);
  } else if (signer.state === "invited" || signer.state === "expired") {
    if (signer.invitedAt) parts.push(t("invitedOn", { date: formatDate(signer.invitedAt, locale) }));
    if (signer.lastRemindedAt) parts.push(t("remindedOn", { date: formatDate(signer.lastRemindedAt, locale) }));
    if (signer.linkExpiresAt)
      parts.push(
        signer.state === "expired"
          ? t("expiredOn", { date: formatDate(signer.linkExpiresAt, locale) })
          : t("linkExpiresOn", { date: formatDate(signer.linkExpiresAt, locale) }),
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
  const t = useTranslations("features.documents.signatureStatusCard");
  const tLabels = useTranslations("labels.documents");
  const locale = useLocale();
  const meta = SIGNER_STATE_META[signer.state];
  const detail = signerDetail(t, signer, locale);
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
            {tLabels(`signerState.${signer.state}`)}
          </StatusPill>
        </div>
        <p className="truncate text-[12.5px] text-soft-ink">{signer.email}</p>
        {detail ? <p className="text-[12px] leading-snug text-soft-ink">{detail}</p> : null}
        {canAct && signer.state === "invited" ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Button size="xs" variant="outline" disabled={busy} onClick={onRemind}>
              <BellRing />
              {t("remind")}
            </Button>
            <Button size="xs" variant="outline" disabled={busy} onClick={onCopy}>
              <Copy />
              {t("copyLink")}
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
  const t = useTranslations("features.documents.signatureStatusCard");
  const actions = useSignerActions(document);
  const tLabels = useTranslations("labels.documents");
  const locale = useLocale();
  const statusKey = document.signatureStatus in SIGNATURE_STATUS_META ? document.signatureStatus : "unsigned";
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
            {t("title")}
          </span>
          <StatusPill size="sm" tone={TONE_TO_PILL[tone]}>
            {tLabels(`signatureStatus.${statusKey}`)}
          </StatusPill>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "unsigned" ? (
          <p className="text-[13px] leading-5 text-soft-ink">
            {t("notSignedYet")}
          </p>
        ) : null}
        {status === "declined" || status === "expired" ? (
          <Callout tone="danger" title={status === "declined" ? t("declinedTitle") : t("expiredTitle")}>
            {t("canSendAgain")}
          </Callout>
        ) : null}

        {signers.length > 0 ? (
          <ol aria-label={t("signers")} className="space-y-0">
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
            {t("waiting")}
          </p>
        ) : null}

        {signed ? (
          <div className="space-y-2">
            {signature?.completedAt ? (
              <p className="text-[13px] text-soft-ink">{t("completedOn", { date: formatDate(signature.completedAt, locale) })}</p>
            ) : null}
            {document.manualSignatureNote ? (
              <Callout tone="warning" title={t("recordedOffline")}>
                {document.manualSignatureNote}
                <span className="mt-1 block text-[12px] text-soft-ink">
                  {document.manualSignedAt
                    ? t("signedByAt", { name: document.manualSignedByName ?? t("manager"), date: formatDate(document.manualSignedAt, locale) })
                    : (document.manualSignedByName ?? t("manager"))}
                </span>
              </Callout>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={`/api/documents/${document.id}?download=1`}>
                  <Download />
                  {t("signedPdf")}
                </a>
              </Button>
              {signature?.certificateArtifactId ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={`/api/documents/${document.id}/evidence/${signature.certificateArtifactId}`}>
                    <FileCheck2 />
                    {t("certificate")}
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
            {t("openDocuSeal")}
          </a>
        ) : null}

        {canManage && !archived ? (
          <div className="flex flex-wrap gap-2">
            {canStart && isPdf ? (
              <Button size="sm" variant="outline" onClick={onSignNow}>
                <LockKeyhole />
                {t("signMyself")}
              </Button>
            ) : null}
            {canStart && data.remoteSignEnabled ? (
              <Button size="sm" onClick={onSendNative}>
                <Send />
                {t("sendForSignature")}
              </Button>
            ) : null}
            {canStart && data.esign.connected ? (
              <Button size="sm" variant={data.remoteSignEnabled ? "outline" : "default"} onClick={onSendDocuSeal}>
                <Send />
                {t("sendWithDocuSeal")}
              </Button>
            ) : null}
            {inFlight && (provider === "native" || provider === "docuseal") ? (
              <Button size="sm" variant="outline" onClick={onVoid}>
                {t("voidRequest")}
              </Button>
            ) : null}
            {status === "unsigned" || status === "declined" || status === "expired" ? (
              <Button size="sm" variant="ghost" onClick={onRecordOffline}>
                {t("recordOffline")}
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
            {t("auditTrail")}
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}
