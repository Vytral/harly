"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/notification-island/toast";

import { PrepareSigningDialog } from "@/features/documents/prepare/PrepareSigningDialog";
import { saveOfferSignatureFieldsAndSend } from "@/features/offers/actions";

/** Offer variant of the shared prepare dialog: one fixed signer (the candidate). */
export function OfferFieldPlacementDialog({
  offerId,
  offerTitle,
  open,
  onOpenChange,
}: {
  offerId: string;
  offerTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("features.offers.offerFieldPlacementDialog");
  const router = useRouter();
  return (
    <PrepareSigningDialog
      open={open}
      onOpenChange={onOpenChange}
      fileUrl={`/api/offers/${offerId}/letter?purpose=placement`}
      subjectName={offerTitle}
      mode={{ kind: "single", signerLabel: t("signerLabel") }}
      submitLabel={t("submit")}
      pendingLabel={t("pending")}
      onSubmit={async (payload) => {
        const result = await saveOfferSignatureFieldsAndSend({
          offerId,
          // The offer action has a single implicit signer and no recipientIndex.
          // The offers backend has no "date" type; the dialog already sends
          // offer dates as labelled text, this only narrows the type.
          fields: payload.fields.map((field) => ({
            ...field,
            type: field.type === "date" ? ("text" as const) : field.type,
            recipientIndex: undefined,
          })),
        });
        if (!result.success) return { ok: false, error: result.error ?? t("sendFailed") };
        toast.success(t("sent"));
        router.refresh();
        return { ok: true };
      }}
    />
  );
}
