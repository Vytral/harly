"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, FileText, Plus, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import {
  cancelDocumentRequest,
  requestDocuments,
  reviewDocumentRequest,
  waiveDocumentRequest,
} from "@/features/documents/requests-actions";
import {
  DOCUMENT_REQUEST_STATUS_META,
  canReviewRequest,
  type DocumentRequestItem,
} from "@/features/documents/requests-shared";

import { EmptySection, SectionHeading } from "./candidate-profile/shared";

type ApplicationOption = { id: string; jobTitle: string };

/** Body-only list of document requests — header/create action live in the parent DocumentsSection card. */
export function DocumentRequestsList({
  requests,
  canManage,
}: {
  requests: DocumentRequestItem[];
  canManage: boolean;
}) {
  const t = useTranslations("features.candidates.DocumentRequestsPanel");
  if (requests.length === 0) {
    return (
      <EmptySection
        icon={FileText}
        title={t("emptyTitle")}
        description={t("emptyDescription")}
      />
    );
  }
  return (
    <div className="space-y-2">
      <SectionHeading>{t("sectionHeading")}</SectionHeading>
      <div className="divide-y rounded-xl border">
        {requests.map((request) => (
          <RequestRow key={request.id} request={request} canManage={canManage} />
        ))}
      </div>
    </div>
  );
}

function RequestRow({ request, canManage }: { request: DocumentRequestItem; canManage: boolean }) {
  const t = useTranslations("features.candidates.DocumentRequestsPanel");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, start] = useTransition();
  const tLabels = useTranslations("labels.documents");
  const meta = DOCUMENT_REQUEST_STATUS_META[request.status];

  function formatDate(value: string | Date) {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
  }

  const metaParts = [
    request.requestedByName ? t("requestedBy", { name: request.requestedByName }) : t("requested"),
    request.dueAt ? t("due", { date: formatDate(request.dueAt) }) : null,
    request.submittedAt ? t("submitted", { date: formatDate(request.submittedAt) }) : null,
  ].filter(Boolean);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    start(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? t("updateError"));
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{request.title}</p>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", meta.className)}>
            {tLabels(`requestStatus.${request.status}`)}
          </span>
        </div>
        {request.instructions ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{request.instructions}</p>
        ) : null}
        <p className="mt-1 text-[11px] text-muted-foreground">{metaParts.join(" · ")}</p>
        {request.documentId ? (
          <Link
            href={`/dashboard/documents/${request.documentId}` as Route}
            className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <FileText className="size-3.5" />
            {request.documentName ?? t("viewUploadedFile")}
          </Link>
        ) : null}
      </div>

      {canManage ? (
        <div className="flex shrink-0 items-center gap-1.5">
          {canReviewRequest(request.status) ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => run(() => reviewDocumentRequest({ requestId: request.id, decision: "accepted" }), t("accepted"))}
              >
                <ThumbsUp className="size-4" />
                {t("accept")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => run(() => reviewDocumentRequest({ requestId: request.id, decision: "declined" }), t("declined"))}
              >
                <ThumbsDown className="size-4" />
                {t("decline")}
              </Button>
            </>
          ) : null}
          {request.status === "pending" ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => run(() => waiveDocumentRequest({ requestId: request.id }), t("waived"))}
              >
                <Check className="size-4" />
                {t("waive")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                aria-label={t("cancelRequest")}
                title={t("cancelRequest")}
                disabled={isPending}
                onClick={() => run(() => cancelDocumentRequest({ requestId: request.id }), t("removed"))}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function RequestDialog({
  applications,
  open,
  onOpenChange,
}: {
  applications: ApplicationOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("features.candidates.DocumentRequestsPanel");
  const router = useRouter();
  const [applicationId, setApplicationId] = useState(applications[0]?.id ?? "");
  const [items, setItems] = useState<Array<{ title: string; instructions: string }>>([
    { title: "", instructions: "" },
  ]);
  const [dueAt, setDueAt] = useState("");
  const [isPending, start] = useTransition();

  function reset() {
    setApplicationId(applications[0]?.id ?? "");
    setItems([{ title: "", instructions: "" }]);
    setDueAt("");
  }

  function submit() {
    const cleaned = items
      .map((item) => ({ title: item.title.trim(), instructions: item.instructions.trim() }))
      .filter((item) => item.title.length > 0);
    if (!applicationId) {
      toast.error(t("chooseApplication"));
      return;
    }
    if (cleaned.length === 0) {
      toast.error(t("addDocumentTitle"));
      return;
    }
    start(async () => {
      const result = await requestDocuments({
        applicationId,
        items: cleaned,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      });
      if (!result.ok) {
        toast.error(result.error ?? t("sendError"));
        return;
      }
      toast.success(t("requestedCount", { count: cleaned.length }));
      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) reset(); onOpenChange(value); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="request-application">{t("applicationLabel")}</Label>
            <select
              id="request-application"
              value={applicationId}
              onChange={(event) => setApplicationId(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {applications.map((application) => (
                <option key={application.id} value={application.id}>
                  {application.jobTitle}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <Label>{t("documentsLabel")}</Label>
            {items.map((item, index) => (
              <div key={index} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={item.title}
                    onChange={(event) =>
                      setItems((current) => current.map((it, i) => (i === index ? { ...it, title: event.target.value } : it)))
                    }
                    placeholder={t("titlePlaceholder")}
                  />
                  {items.length > 1 ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t("removeDocument", { number: index + 1 })}
                      onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
                <Input
                  value={item.instructions}
                  onChange={(event) =>
                    setItems((current) => current.map((it, i) => (i === index ? { ...it, instructions: event.target.value } : it)))
                  }
                  placeholder={t("instructionsPlaceholder")}
                  className="text-base sm:text-xs"
                />
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setItems((current) => [...current, { title: "", instructions: "" }])}
            >
              <Plus className="size-4" />
              {t("addAnother")}
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="request-due">{t("dueDateLabel")}</Label>
            <Input id="request-due" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? t("sending") : t("sendRequest")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
