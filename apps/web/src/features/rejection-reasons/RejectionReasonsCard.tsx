"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Pencil, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

import { toast } from "@/lib/notification-island/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SettingRow, SettingRows, SettingSection } from "@/components/ui/setting-row";
import {
  addRejectionReasonAction,
  renameRejectionReasonAction,
  setRejectionReasonArchivedAction,
} from "@/features/rejection-reasons/actions";
import type { RejectionReasonOption } from "@/features/rejection-reasons/shared";

/**
 * Workspace catalog of rejection reasons (Settings → Company & brand).
 * Archiving hides a reason from RejectDialog; past rejections keep it.
 */
export function RejectionReasonsCard({
  reasons,
  canEdit = true,
}: {
  reasons: RejectionReasonOption[];
  canEdit?: boolean;
}) {
  const t = useTranslations("features.rejectionReasons.rejectionReasonsCard");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newLabel, setNewLabel] = useState("");

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
    after?: () => void,
  ) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error ?? t("couldNotSave"));
          return;
        }
        toast.success(success);
        after?.();
        router.refresh();
      } catch {
        toast.error(t("couldNotSave"));
      }
    });
  }

  const activeCount = reasons.filter((reason) => !reason.archived).length;

  return (
    <Card className="gap-0 p-0">
      <SettingSection
        title={t("title")}
        description={t("description")}
      >
        <SettingRows>
          {reasons.map((reason) => {
            const isEditing = editing === reason.code;
            const inputId = `rejection-reason-${reason.code}`;
            return (
              <SettingRow
                key={reason.code}
                htmlFor={isEditing ? inputId : undefined}
                title={
                  isEditing ? (
                    <span className="sr-only">{t("renameSr", { label: reason.label })}</span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <span className={reason.archived ? "text-soft-ink" : undefined}>
                        {reason.label}
                      </span>
                      {reason.archived ? <Badge variant="neutral">{t("archived")}</Badge> : null}
                    </span>
                  )
                }
                control={
                  !canEdit ? null : isEditing ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => setEditing(null)}
                      >
                        {t("cancel")}
                      </Button>
                      <Button
                        size="sm"
                        disabled={pending || !draft.trim() || draft.trim() === reason.label}
                        onClick={() =>
                          run(
                            () => renameRejectionReasonAction(reason.code, draft),
                            t("reasonRenamed"),
                            () => setEditing(null),
                          )
                        }
                      >
                        {t("save")}
                      </Button>
                    </>
                  ) : (
                    <>
                      {!reason.archived ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => {
                            setEditing(reason.code);
                            setDraft(reason.label);
                          }}
                        >
                          <Pencil className="size-3.5" />
                          {t("rename")}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending || (!reason.archived && activeCount <= 1)}
                        title={
                          !reason.archived && activeCount <= 1
                            ? t("keepOneActive")
                            : undefined
                        }
                        onClick={() =>
                          run(
                            () =>
                              setRejectionReasonArchivedAction(reason.code, !reason.archived),
                            reason.archived ? t("reasonRestored") : t("reasonArchived"),
                          )
                        }
                      >
                        {reason.archived ? (
                          <>
                            <RotateCcw className="size-3.5" />
                            {t("restore")}
                          </>
                        ) : (
                          <>
                            <Archive className="size-3.5" />
                            {t("archive")}
                          </>
                        )}
                      </Button>
                    </>
                  )
                }
              >
                {isEditing ? (
                  <Input
                    id={inputId}
                    value={draft}
                    maxLength={80}
                    autoFocus
                    disabled={pending}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setEditing(null);
                      if (event.key === "Enter" && draft.trim()) {
                        event.preventDefault();
                        run(
                          () => renameRejectionReasonAction(reason.code, draft),
                          t("reasonRenamed"),
                          () => setEditing(null),
                        );
                      }
                    }}
                  />
                ) : null}
              </SettingRow>
            );
          })}
          {canEdit ? (
            <SettingRow
              htmlFor="rejection-reason-new"
              title={t("addReasonTitle")}
              description={t("addReasonDescription")}
            >
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!newLabel.trim()) return;
                  run(
                    () => addRejectionReasonAction(newLabel),
                    t("reasonAdded"),
                    () => setNewLabel(""),
                  );
                }}
              >
                <Input
                  id="rejection-reason-new"
                  value={newLabel}
                  maxLength={80}
                  placeholder={t("addReasonPlaceholder")}
                  disabled={pending}
                  onChange={(event) => setNewLabel(event.target.value)}
                  className="sm:flex-1"
                />
                <Button type="submit" size="sm" disabled={pending || !newLabel.trim()} className="sm:h-9">
                  {t("addReason")}
                </Button>
              </form>
            </SettingRow>
          ) : null}
        </SettingRows>
      </SettingSection>
    </Card>
  );
}
