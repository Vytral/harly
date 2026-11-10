"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { rejectApplicationsAction } from "@/features/candidates/actions";
import {
  getRejectDialogDataAction,
  previewRejectionEmailAction,
  type RejectDialogData,
} from "@/features/rejection-reasons/actions";
import {
  BUILT_IN_REJECTION_TEMPLATE,
  rejectDialogCopy,
  type RejectTarget,
  type RejectionDecision,
  type RejectionEmailPreview,
} from "@/features/rejection-reasons/shared";
import { cn } from "@/lib/utils";

export type { RejectTarget };

/**
 * The one way the app rejects: reason (required), internal note, and an
 * explicit choice to email the candidate with a previewable template. Used by
 * the candidate page, the candidates table and the pipeline list, for one or
 * many applications.
 */
export function RejectDialog({
  open,
  onOpenChange,
  targets,
  onRejected,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: RejectTarget[];
  /** Runs after a successful rejection (clear selection, advance a queue…). */
  onRejected?: () => void;
  /**
   * Hand the decision to the caller instead of rejecting here (the pipeline
   * board queues it as an optimistic write). The dialog closes right away.
   */
  onConfirm?: (decision: RejectionDecision) => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isPending) onOpenChange(next);
      }}
    >
      <DialogContent size="lg" showCloseButton={!isPending}>
        {/* Content unmounts when closed, so each open starts fresh. */}
        {targets.length > 0 ? (
          <RejectDialogBody
            targets={targets}
            isPending={isPending}
            startTransition={startTransition}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
            onDone={() => {
              onOpenChange(false);
              onRejected?.();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RejectDialogBody({
  targets,
  isPending,
  startTransition,
  onCancel,
  onConfirm,
  onDone,
}: {
  targets: RejectTarget[];
  isPending: boolean;
  startTransition: (callback: () => Promise<void>) => void;
  onCancel: () => void;
  onConfirm?: (decision: RejectionDecision) => void;
  onDone: () => void;
}) {
  const t = useTranslations("features.rejectionReasons.rejectDialog");
  const tCopy = useTranslations("labels.rejectionReasons.dialogCopy");
  const router = useRouter();
  const ids = useId();
  const copy = rejectDialogCopy(tCopy, targets);
  const bulk = targets.length > 1;
  const first = targets[0];

  const [data, setData] = useState<RejectDialogData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previews, setPreviews] = useState<
    Record<string, RejectionEmailPreview | { error: string }>
  >({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reasonMissing, setReasonMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getRejectDialogDataAction().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setData(result.data);
        setTemplateId(result.data.defaultTemplateId);
      } else {
        setLoadError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedTemplate = templateId ?? BUILT_IN_REJECTION_TEMPLATE;
  const preview = previews[selectedTemplate];
  useEffect(() => {
    if (!previewOpen || !sendEmail || !data || preview) return;
    let cancelled = false;
    void previewRejectionEmailAction({
      applicationId: first.applicationId,
      templateId: selectedTemplate,
    }).then((result) => {
      if (cancelled) return;
      setPreviews((current) => ({
        ...current,
        [selectedTemplate]: result.ok ? result.preview : { error: result.error },
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [previewOpen, sendEmail, data, preview, first.applicationId, selectedTemplate]);

  function submit() {
    if (!reasonCode) {
      setReasonMissing(true);
      setSubmitError(t("chooseReason"));
      return;
    }
    setReasonMissing(false);
    setSubmitError(null);
    const decision: RejectionDecision = {
      reasonCode,
      note: note.trim() || undefined,
      sendEmail,
      ...(sendEmail
        ? {
            templateId:
              selectedTemplate === BUILT_IN_REJECTION_TEMPLATE
                ? null
                : selectedTemplate,
          }
        : {}),
    };
    if (onConfirm) {
      onConfirm(decision);
      onDone();
      return;
    }
    startTransition(async () => {
      const result = await rejectApplicationsAction({
        applicationIds: targets.map((target) => target.applicationId),
        ...decision,
      });
      if (!result.success) {
        setSubmitError(result.error ?? t("rejectFallback"));
        return;
      }
      if (result.emailWarning) {
        toast.warning(
          t("successWithWarning", { message: copy.successMessage, warning: result.emailWarning }),
        );
      } else {
        toast.success(
          sendEmail
            ? copy.successMessage
            : t("successWithoutEmail", { message: copy.successMessage }),
        );
      }
      (router as { refresh?: () => void }).refresh?.();
      onDone();
    });
  }

  const loading = !data && !loadError;
  const templates = data?.templates ?? [];

  return (
    <>
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>
          {copy.jobLine ? `${copy.jobLine} ` : ""}
          {t("description")}
        </DialogDescription>
      </DialogHeader>

      {loadError ? <Callout tone="danger">{loadError}</Callout> : null}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-reason`}>
            {t.rich("reasonLabel", {
              srOnly: (chunks) => <span className="sr-only">{chunks}</span>,
            })}
          </Label>
          <Select
            value={reasonCode}
            onValueChange={(value) => {
              setReasonCode(value);
              setReasonMissing(false);
              setSubmitError(null);
            }}
            disabled={loading || isPending}
          >
            <SelectTrigger
              id={`${ids}-reason`}
              className="w-full"
              aria-required="true"
              aria-invalid={reasonMissing || undefined}
            >
              <SelectValue placeholder={loading ? t("loadingReasons") : t("chooseReasonPlaceholder")} />
            </SelectTrigger>
            <SelectContent position="popper">
              {(data?.reasons ?? []).map((reason) => (
                <SelectItem key={reason.code} value={reason.code}>
                  {reason.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-note`}>
            {t.rich("noteLabel", {
              muted: (chunks) => <span className="font-normal text-soft-ink">{chunks}</span>,
            })}
          </Label>
          <Textarea
            id={`${ids}-note`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2000}
            rows={3}
            disabled={isPending}
            aria-describedby={`${ids}-note-help`}
            placeholder={t("notePlaceholder")}
          />
          <p id={`${ids}-note-help`} className="text-[12.5px] text-soft-ink">
            {t("noteHelp")}
          </p>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-inner)] border border-hairline">
          <SettingRow
            htmlFor={`${ids}-send`}
            descriptionId={`${ids}-send-desc`}
            title={t("sendEmailTitle")}
            description={
              sendEmail
                ? bulk
                  ? t("sentIndividually")
                  : t("sentTo", { name: first.candidateName })
                : t("notEmailed")
            }
            control={
              <Switch
                id={`${ids}-send`}
                aria-describedby={`${ids}-send-desc`}
                checked={sendEmail}
                onCheckedChange={setSendEmail}
                disabled={isPending}
              />
            }
          >
            {sendEmail ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${ids}-template`}>{t("template")}</Label>
                  <Select
                    value={selectedTemplate}
                    onValueChange={setTemplateId}
                    disabled={loading || isPending}
                  >
                    <SelectTrigger id={`${ids}-template`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.isActive
                            ? t("templateDefault", { name: template.name })
                            : template.name}
                        </SelectItem>
                      ))}
                      <SelectItem value={BUILT_IN_REJECTION_TEMPLATE}>
                        {templates.some((template) => template.isActive)
                          ? t("builtInTemplate")
                          : t("builtInTemplateDefault")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded text-[13px] font-medium text-near-ink outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  aria-expanded={previewOpen}
                  aria-controls={`${ids}-preview`}
                  onClick={() => setPreviewOpen((value) => !value)}
                  disabled={loading}
                >
                  <ChevronDown
                    className={cn(
                      "size-4 transition-transform duration-150 motion-reduce:transition-none",
                      previewOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                  {previewOpen ? t("hidePreview") : t("previewEmail")}
                </button>

                {previewOpen ? (
                  <div
                    id={`${ids}-preview`}
                    className="space-y-2 rounded-[var(--radius-inner)] bg-card-inset p-3 text-sm"
                    aria-live="polite"
                  >
                    {!preview ? (
                      <p className="flex items-center gap-2 text-soft-ink">
                        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                        {t("loadingPreview")}
                      </p>
                    ) : "error" in preview ? (
                      <p className="text-soft-ink">{preview.error}</p>
                    ) : (
                      <>
                        {bulk ? (
                          <p className="text-[12.5px] text-soft-ink">
                            {t("previewBulk", { name: preview.candidateName })}
                          </p>
                        ) : null}
                        <p className="text-[12.5px] text-soft-ink">
                          {t.rich("previewRecipient", {
                            address: preview.to,
                            recipient: (chunks) => <span className="text-near-ink">{chunks}</span>,
                          })}
                        </p>
                        <p className="font-medium text-near-ink">{preview.subject}</p>
                        <p className="max-h-56 overflow-y-auto whitespace-pre-line leading-6 text-soft-ink">
                          {preview.body}
                        </p>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </SettingRow>
        </div>

        {submitError ? <Callout tone="danger">{submitError}</Callout> : null}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isPending}>
          {t("cancel")}
        </Button>
        <Button
          variant="destructive"
          onClick={submit}
          disabled={isPending || loading || Boolean(loadError) || !reasonCode}
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              {t("rejecting")}
            </>
          ) : (
            copy.confirmLabel
          )}
        </Button>
      </DialogFooter>
    </>
  );
}
