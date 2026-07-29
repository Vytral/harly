"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { requestPortalErasureAction } from "./profile-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DSAR_TYPE_META,
  DsarStatusBadge,
  isOpenDsarStatus,
  type DsarStatus,
} from "@/features/workspaces/dsar-shared";

type ErasureRequest = {
  status: DsarStatus;
  createdAt: Date;
} | null;

const STATUS_COPY: Record<DsarStatus, string> = {
  pending: "Your deletion request is awaiting review.",
  processing: "Your deletion request is being processed.",
  blocked: "Your deletion request is temporarily blocked by a legal hold.",
  completed: "Your deletion request has been completed.",
  denied: "Your deletion request was not approved. Contact the hiring team if you have questions.",
};

export function PortalPrivacyControls({ erasureRequest }: { erasureRequest: ErasureRequest }) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [requestStatus, setRequestStatus] = useState<DsarStatus | null>(erasureRequest?.status ?? null);
  const hasOpenRequest = requestStatus !== null && isOpenDsarStatus(requestStatus);
  const erasureMeta = DSAR_TYPE_META.erasure;

  function requestErasure() {
    startTransition(async () => {
      const result = await requestPortalErasureAction();
      if (!result.ok) {
        toast.error(result.error ?? "Unable to submit deletion request.");
        return;
      }
      setRequestStatus(result.status ?? "pending");
      setConfirmOpen(false);
      toast.success("Your deletion request has been submitted for review.");
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-foreground">Your data</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Download a portable copy of your profile and applications, or request deletion.
      </p>

      {requestStatus ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/60">
          <span
            className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${erasureMeta.className}`}
          >
            <erasureMeta.icon className="size-4" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">{erasureMeta.label}</p>
              <DsarStatusBadge status={requestStatus} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground" role="status">
              {STATUS_COPY[requestStatus]}
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2.5">
        <Button variant="outline" size="sm" asChild>
          <a href="/api/portal/privacy/export?format=json">
            <Download className="size-4" />
            Download JSON
          </a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href="/api/portal/privacy/export?format=csv">
            <Download className="size-4" />
            Download CSV
          </a>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending || hasOpenRequest || requestStatus === "completed"}
          className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {isPending
            ? "Submitting…"
            : hasOpenRequest
              ? "Deletion requested"
              : requestStatus === "completed"
                ? "Deletion completed"
                : "Request deletion"}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request deletion of your data?</DialogTitle>
            <DialogDescription>
              The hiring team will review your request. Once completed, your portal access and candidate data may no longer be available.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={requestErasure} disabled={isPending}>
              {isPending ? "Submitting…" : "Request deletion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
