"use client";

import { useState, useTransition } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, FileText, Plus, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";
import { toast } from "sonner";

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

type ApplicationOption = { id: string; jobTitle: string };

export function DocumentRequestsPanel({
  requests,
  applications,
  canManage,
}: {
  requests: DocumentRequestItem[];
  applications: ApplicationOption[];
  canManage: boolean;
}) {
  const [requestOpen, setRequestOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium">Requested documents</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Ask the candidate to upload documents through their portal. Uploads land in the Documents hub for review.
            </p>
          </div>
        </div>
        {canManage ? (
          <Button
            size="sm"
            onClick={() => setRequestOpen(true)}
            disabled={applications.length === 0}
            title={applications.length === 0 ? "This candidate has no application to attach a request to." : undefined}
          >
            <Plus className="size-4" />
            Request
          </Button>
        ) : null}
      </div>

      {requests.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-10 text-center">
          <FileText className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No document requests yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Request an ID, signed NDA, or any file — the candidate uploads it from their portal.
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-xl border">
          {requests.map((request) => (
            <RequestRow key={request.id} request={request} canManage={canManage} />
          ))}
        </div>
      )}

      {canManage ? (
        <RequestDialog
          applications={applications}
          open={requestOpen}
          onOpenChange={setRequestOpen}
        />
      ) : null}
    </div>
  );
}

function RequestRow({ request, canManage }: { request: DocumentRequestItem; canManage: boolean }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const meta = DOCUMENT_REQUEST_STATUS_META[request.status];

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    start(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? "Could not update the request.");
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
            {meta.label}
          </span>
        </div>
        {request.instructions ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{request.instructions}</p>
        ) : null}
        <p className="mt-1 text-[11px] text-muted-foreground">
          {request.requestedByName ? `Requested by ${request.requestedByName}` : "Requested"}
          {request.dueAt
            ? ` · due ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(request.dueAt))}`
            : ""}
          {request.submittedAt
            ? ` · submitted ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(request.submittedAt))}`
            : ""}
        </p>
        {request.documentId ? (
          <Link
            href={`/dashboard/documents/${request.documentId}` as Route}
            className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <FileText className="size-3.5" />
            {request.documentName ?? "View uploaded file"}
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
                onClick={() => run(() => reviewDocumentRequest({ requestId: request.id, decision: "accepted" }), "Document accepted")}
              >
                <ThumbsUp className="size-4" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => run(() => reviewDocumentRequest({ requestId: request.id, decision: "declined" }), "Document declined")}
              >
                <ThumbsDown className="size-4" />
                Decline
              </Button>
            </>
          ) : null}
          {request.status === "pending" ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => run(() => waiveDocumentRequest({ requestId: request.id }), "Request waived")}
              >
                <Check className="size-4" />
                Waive
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={isPending}
                onClick={() => run(() => cancelDocumentRequest({ requestId: request.id }), "Request removed")}
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

function RequestDialog({
  applications,
  open,
  onOpenChange,
}: {
  applications: ApplicationOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
      toast.error("Choose an application.");
      return;
    }
    if (cleaned.length === 0) {
      toast.error("Add at least one document title.");
      return;
    }
    start(async () => {
      const result = await requestDocuments({
        applicationId,
        items: cleaned,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not send the request.");
        return;
      }
      toast.success(cleaned.length === 1 ? "Document requested" : `${cleaned.length} documents requested`);
      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) reset(); onOpenChange(value); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request documents</DialogTitle>
          <DialogDescription>
            The candidate is notified in their portal and uploads each file there. You review the uploads here.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="request-application">Application</Label>
            <select
              id="request-application"
              value={applicationId}
              onChange={(event) => setApplicationId(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {applications.map((application) => (
                <option key={application.id} value={application.id}>
                  {application.jobTitle}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <Label>Documents</Label>
            {items.map((item, index) => (
              <div key={index} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={item.title}
                    onChange={(event) =>
                      setItems((current) => current.map((it, i) => (i === index ? { ...it, title: event.target.value } : it)))
                    }
                    placeholder="e.g. Signed NDA, Passport, Tax form"
                  />
                  {items.length > 1 ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                    >
                      <X className="size-4" />
                    </Button>
                  ) : null}
                </div>
                <Input
                  value={item.instructions}
                  onChange={(event) =>
                    setItems((current) => current.map((it, i) => (i === index ? { ...it, instructions: event.target.value } : it)))
                  }
                  placeholder="Instructions (optional)"
                  className="text-xs"
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
              Add another
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="request-due">Due date (optional)</Label>
            <Input id="request-due" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? "Sending…" : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
