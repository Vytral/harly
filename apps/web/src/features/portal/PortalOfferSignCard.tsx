"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";

import { cn } from "@/lib/utils";
import { createOfferSigningViewAction } from "@/features/portal/actions";
import { PortalOfferSignDialog } from "@/features/portal/PortalOfferSignDialog";
import {
  CheckCircleIcon,
  FileTextIcon,
  XCircleIcon,
} from "@/components/ui/icons/phosphor";

type PortalOffer = {
  id: string;
  status: "sent" | "accepted" | "declined";
  title: string;
  esignSubmissionId: string | null;
  expiresAt: Date | null;
};

type Props = {
  applicationId: string;
  offer: PortalOffer;
  isExpired: boolean;
  /**
   * True when the URL carries ?signed=pending — DocuSeal redirected the
   * candidate back here after the signing ceremony, but the webhook may not
   * have flipped the offer status yet. Surface a "verifying" state.
   */
  signedPending: boolean;
};

export function PortalOfferSignCard({
  applicationId,
  offer,
  isExpired,
  signedPending,
}: Props) {
  const t = useTranslations("portal.offer");
  const locale = useLocale();
  const [isPending, start] = useTransition();
  const [nativeSignOpen, setNativeSignOpen] = useState(false);
  const isNative = offer.esignSubmissionId?.startsWith("native:") ?? false;

  function startSigning() {
    if (isNative) {
      setNativeSignOpen(true);
      return;
    }
    start(async () => {
      const result = await createOfferSigningViewAction({ applicationId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // Single-use hosted signing URL — redirect, never persist.
      window.location.href = result.signingUrl;
    });
  }

  // Terminal states: the webhook already flipped the offer. Show confirmation,
  // no CTA. signedPending is stale here (refresh will clear it).
  if (offer.status === "accepted") {
    return (
      <div className="rounded-2xl border border-pine/30 bg-pine/5 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-start gap-3">
          <CheckCircleIcon className="size-6 shrink-0 text-pine" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t("accepted")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.rich("acceptedBody", { title: offer.title, strong: (chunks) => <strong>{chunks}</strong> })}
            </p>
            <a
              href={`/api/portal/offers/${offer.id}/evidence`}
              className="mt-3 inline-flex text-sm font-semibold text-pine underline-offset-4 hover:underline"
            >
              {t("exportEvidence")}
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (offer.status === "declined") {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-start gap-3">
          <XCircleIcon className="size-6 shrink-0 text-destructive" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t("declined")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.rich("declinedBody", { title: offer.title, strong: (chunks) => <strong>{chunks}</strong> })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-start gap-3">
          <XCircleIcon className="size-6 shrink-0 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t("expired")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("expiredBody")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // status === "sent" — actionable.
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pine/10 text-pine">
            <FileTextIcon className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {t("title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.rich("body", { title: offer.title, strong: (chunks) => <strong>{chunks}</strong> })}
              {offer.expiresAt && <> {t("respondBy", { date: new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(offer.expiresAt)) })}</>}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={startSigning}
          disabled={isPending}
          className={cn(
            "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5",
            "text-sm font-semibold text-primary-foreground shadow-sm transition-all",
            "hover:bg-primary/90 active:scale-[0.98]",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
          )}
        >
          {isPending ? t("preparing") : t("reviewSign")}
        </button>
      </div>

      {signedPending && !isNative && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-pine/20 bg-pine/5 px-3.5 py-2.5 text-sm text-pine-strong">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-pine" />
          {t("verifying")}
        </div>
      )}

      {isNative && (
        <PortalOfferSignDialog
          offerId={offer.id}
          offerTitle={offer.title}
          open={nativeSignOpen}
          onOpenChange={setNativeSignOpen}
        />
      )}
    </div>
  );
}
