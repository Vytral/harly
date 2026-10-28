"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  cancelEmailDeliveryAction,
  listEmailDeliveryLogAction,
  retryEmailDeliveryAction,
} from "@/features/email-outbox/actions";
import type { DeliveryLogPage, DeliveryLogRow } from "@/features/email-outbox/service";
import { OUTBOX_FILTERS, type OutboxFilter } from "@/features/email-outbox/describe";
import { cn } from "@/lib/utils";

const FILTER_LABELS: Record<OutboxFilter, string> = {
  all: "All",
  failed: "Failed",
  pending: "Pending",
  sent: "Sent",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Queued",
  processing: "Sending",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled",
};

function formatTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function DeliveryLog({ initial }: { initial: DeliveryLogPage }) {
  const [data, setData] = useState<DeliveryLogPage>(initial);
  const [filter, setFilter] = useState<OutboxFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load(nextFilter: OutboxFilter, page: number) {
    startTransition(async () => {
      setError(null);
      const result = await listEmailDeliveryLogAction({ filter: nextFilter, page });
      if (result.ok) {
        setFilter(nextFilter);
        setData(result.data);
      } else {
        setError(result.error);
      }
    });
  }

  async function act(row: DeliveryLogRow, kind: "retry" | "cancel") {
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    try {
      const result =
        kind === "retry"
          ? await retryEmailDeliveryAction({ id: row.id })
          : await cancelEmailDeliveryAction({ id: row.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(
        kind === "retry"
          ? "Retry attempted. Check the status below; a failed retry stays in the log."
          : "Email cancelled. It will not be sent.",
      );
      load(filter, data.page);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">Delivery log</h2>
        <p className="text-sm text-muted-foreground">
          Recent candidate and recruiter emails. Failed emails are not retried automatically; retry or
          cancel them here. Recipients are visible only to people who can manage email settings.
        </p>
      </div>

      <div role="group" aria-label="Filter deliveries" className="flex flex-wrap gap-2">
        {OUTBOX_FILTERS.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={filter === option ? "default" : "outline"}
            aria-pressed={filter === option}
            disabled={isPending}
            onClick={() => load(option, 1)}
          >
            {FILTER_LABELS[option]}
          </Button>
        ))}
      </div>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}

      {data.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No emails match this filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Queued</th>
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Recipient</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Attempts</th>
                <th className="py-2 pr-3 font-medium">Last error</th>
                <th className="py-2 pr-3 font-medium">Next retry</th>
                <th className="py-2 pr-3 font-medium">Sent</th>
                <th className="py-2 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} className="border-t border-border align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{formatTime(row.createdAt)}</td>
                  <td className="py-2 pr-3">
                    <div>{row.kindLabel}</div>
                    <div className="text-xs text-muted-foreground">{row.summary}</div>
                  </td>
                  <td className="py-2 pr-3 break-all">{row.recipient ?? "—"}</td>
                  <td className={cn("py-2 pr-3", row.status === "failed" && "text-destructive")}>
                    {STATUS_LABELS[row.status] ?? row.status}
                  </td>
                  <td className="py-2 pr-3">{row.attempts}</td>
                  <td className="py-2 pr-3 max-w-[220px] break-words text-muted-foreground">
                    {row.lastError ?? "—"}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{formatTime(row.nextRetryAt)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{formatTime(row.sentAt)}</td>
                  <td className="py-2 whitespace-nowrap">
                    {row.canRetry ? (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyId === row.id}
                          onClick={() => act(row, "retry")}
                        >
                          Retry
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busyId === row.id}
                          onClick={() => act(row, "cancel")}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!data.hasPrevious || isPending}
          onClick={() => load(filter, data.page - 1)}
        >
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">Page {data.page}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!data.hasNext || isPending}
          onClick={() => load(filter, data.page + 1)}
        >
          Next
        </Button>
      </div>
    </Card>
  );
}
