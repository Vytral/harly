"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import {
  CaretRightIcon,
  CheckCircleIcon,
  UserCircleIcon,
  XIcon,
} from "@/components/ui/icons/phosphor";
import type { PortalProfileCompletion } from "./profile-completion";

const DISMISS_KEY = "portal:profile-complete-dismissed";

export function PortalProfileCompletionCard({
  completion,
}: {
  completion: PortalProfileCompletion;
}) {
  const t = useTranslations("portal.profileCompletion");
  const locale = useLocale();
  const percent = new Intl.NumberFormat(locale, { style: "percent" }).format(completion.percentage / 100);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (completion.percentage === 100) {
    if (dismissed) return null;

    return (
      <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-sage-wash px-4 py-3">
        <CheckCircleIcon className="size-5 shrink-0 text-success-olive" />
        <p className="text-sm text-success-olive">
          {t("complete")}
        </p>
        <Link
          href="/portal/profile"
          className="ml-auto shrink-0 text-sm font-medium text-success-olive underline-offset-2 hover:underline"
        >
          {t("review")}
        </Link>
        <button
          type="button"
          aria-label={t("dismiss")}
          onClick={() => {
            window.localStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
          className="shrink-0 rounded-md p-1 text-success-olive hover:bg-pure-snow/60"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-hairline bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-lime-wash text-near-ink">
          <UserCircleIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              {t("title")}
            </h2>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {percent}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("description")}
          </p>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-card-inset"
            aria-label={t("progress", { percent })}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completion.percentage}
          >
            <div
              className="animate-segment-fill h-full rounded-full bg-lime"
              style={{ width: `${completion.percentage}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("suggested", { fields: new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(completion.missing.slice(0, 3).map((field) => t(`fields.${field}`))) })}
          </p>
          <Link
            href="/portal/profile"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-2 hover:underline"
          >
            {t("action")}
            <CaretRightIcon className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
