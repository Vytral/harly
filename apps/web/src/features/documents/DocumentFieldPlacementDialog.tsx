"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";

import { PrepareSigningDialog } from "@/features/documents/prepare/PrepareSigningDialog";
import { saveDocumentSignatureFieldsAndSend } from "@/features/documents/native-sign-actions";
import type { DocumentListItem } from "@/features/documents/shared";

/**
 * "Native link" send flow: add signers (in signing order), place
 * colour-coded fields for each one, optionally set the invite subject and
 * message, then send. All UI lives in the shared PrepareSigningDialog.
 */
export function DocumentFieldPlacementDialog({
  document,
  open,
  onOpenChange,
}: {
  document: DocumentListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const t = useTranslations("features.documents.documentFieldPlacementDialog");
  const tCommon = useTranslations();
  return (
    <PrepareSigningDialog
      open={open}
      onOpenChange={onOpenChange}
      fileUrl={`/api/documents/${document.id}`}
      subjectName={document.name}
      mode={{ kind: "multi", showMessage: true }}
      submitLabel={t("submitLabel")}
      pendingLabel={tCommon("pages.sign.nativeSigningPage.sending")}
      onSubmit={async (payload) => {
        const result = await saveDocumentSignatureFieldsAndSend({
          documentId: document.id,
          fields: payload.fields,
          recipients: payload.recipients,
          subject: payload.subject,
          message: payload.message,
        });
        if (!result.ok) return { ok: false, error: result.error ?? t("sendFallbackError") };
        toast.success(t("sent"));
        router.refresh();
        return { ok: true };
      }}
    />
  );
}
