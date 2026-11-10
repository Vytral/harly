"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

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

const STATUS_KEYS = ["pending", "processing", "sent", "failed", "cancelled"] as const;
type StatusKey = (typeof STATUS_KEYS)[number];

function isStatusKey(value: string): value is StatusKey {
  return (STATUS_KEYS as readonly string[]).includes(value);
}

function formatTime(value: string | null, locale: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function DeliveryLog({ initial }: { initial: DeliveryLogPage }) {
  const t = useTranslations("features.emailOutbox.deliveryLog");
  const locale = useLocale();
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
      setNotice(kind === "retry" ? t("retryNotice") : t("cancelNotice"));
      load(filter, data.page);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <div role="group" aria-label={t("filterAria")} className="flex flex-wrap gap-2">
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
            {t(`filters.${option}`)}
          </Button>
        ))}
      </div>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}

      {data.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">{t("columns.queued")}</th>
                <th className="py-2 pr-3 font-medium">{t("columns.email")}</th>
                <th className="py-2 pr-3 font-medium">{t("columns.recipient")}</th>
                <th className="py-2 pr-3 font-medium">{t("columns.status")}</th>
                <th className="py-2 pr-3 font-medium">{t("columns.attempts")}</th>
                <th className="py-2 pr-3 font-medium">{t("columns.lastError")}</th>
                <th className="py-2 pr-3 font-medium">{t("columns.nextRetry")}</th>
                <th className="py-2 pr-3 font-medium">{t("columns.sent")}</th>
                <th className="py-2 font-medium"><span className="sr-only">{t("columns.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} className="border-t border-border align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{formatTime(row.createdAt, locale)}</td>
                  <td className="py-2 pr-3">
                    <div>{row.kindLabel}</div>
                    <div className="text-xs text-muted-foreground">{row.summary}</div>
                  </td>
                  <td className="py-2 pr-3 break-all">{row.recipient ?? "—"}</td>
                  <td className={cn("py-2 pr-3", row.status === "failed" && "text-destructive")}>
                    {isStatusKey(row.status) ? t(`statuses.${row.status}`) : row.status}
                  </td>
                  <td className="py-2 pr-3">{row.attempts}</td>
                  <td className="py-2 pr-3 max-w-[220px] break-words text-muted-foreground">
                    {row.lastError ?? "—"}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{formatTime(row.nextRetryAt, locale)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{formatTime(row.sentAt, locale)}</td>
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
                          {t("retry")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busyId === row.id}
                          onClick={() => act(row, "cancel")}
                        >
                          {t("cancel")}
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
          {t("previous")}
        </Button>
        <span className="text-xs text-muted-foreground">{t("page", { page: data.page })}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!data.hasNext || isPending}
          onClick={() => load(filter, data.page + 1)}
        >
          {t("next")}
        </Button>
      </div>
    </Card>
  );
}
