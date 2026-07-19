"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { requestPortalErasureAction } from "./profile-actions";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ErasureRequest = {
  status: "pending" | "processing" | "completed" | "denied";
  createdAt: Date;
} | null;

export function PortalPrivacyControls({ erasureRequest }: { erasureRequest: ErasureRequest }) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [requestStatus, setRequestStatus] = useState(erasureRequest?.status ?? null);
  const hasOpenRequest = requestStatus === "pending" || requestStatus === "processing";

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
      {requestStatus && (
        <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground" role="status">
          {requestStatus === "pending" && "Your deletion request is awaiting review."}
          {requestStatus === "processing" && "Your deletion request is being processed."}
          {requestStatus === "completed" && "Your deletion request has been completed."}
          {requestStatus === "denied" && "Your deletion request was not approved. Contact the hiring team if you have questions."}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <a className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted" href="/api/portal/privacy/export?format=json">
          Download JSON
        </a>
        <a className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted" href="/api/portal/privacy/export?format=csv">
          Download CSV
        </a>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending || hasOpenRequest || requestStatus === "completed"}
          className="rounded-lg px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          {isPending ? "Submitting…" : hasOpenRequest ? "Deletion requested" : requestStatus === "completed" ? "Deletion completed" : "Request deletion"}
        </button>
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
              <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted" disabled={isPending}>
                Cancel
              </button>
            </DialogClose>
            <button type="button" onClick={requestErasure} disabled={isPending} className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50">
              {isPending ? "Submitting…" : "Request deletion"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
