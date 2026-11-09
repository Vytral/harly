"use client";

import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function UnsavedChangesDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("ui.unsavedChangesDialog");
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => !next && onCancel()}
      tone="warning"
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirmLabel")}
      cancelLabel={t("cancelLabel")}
      // The caller navigates away or closes the editor itself.
      closeOnConfirm={false}
      onConfirm={onConfirm}
    />
  );
}
