"use client";

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
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => !next && onCancel()}
      tone="warning"
      title="Leave without saving?"
      description="You have unsaved changes. If you leave now, they will be lost."
      confirmLabel="Leave without saving"
      cancelLabel="Keep editing"
      // The caller navigates away or closes the editor itself.
      closeOnConfirm={false}
      onConfirm={onConfirm}
    />
  );
}
