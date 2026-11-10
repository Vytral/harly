import { Briefcase, MapPin } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export function JobIdentity({
  title,
  department,
  location,
  deletedAt,
  muted = false,
}: {
  title: string;
  department: string | null;
  location: string | null;
  deletedAt?: Date | null;
  muted?: boolean;
}) {
  const t = useTranslations("jobs.identity");
  const format = useFormatter();
  return (
    <span className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-inner)] bg-card-inset text-soft-ink">
        <Briefcase className="size-4" />
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block truncate text-[14.5px] font-medium",
            muted
              ? "text-soft-ink"
              : "text-near-ink group-hover:underline group-hover:underline-offset-4",
          )}
        >
          {title}
        </span>
        <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-soft-ink">
          {deletedAt ? (
            <>{t("deleted", { time: format.relativeTime(deletedAt) })}</>
          ) : location ? (
            <>
              <MapPin className="size-3 shrink-0" />
              {[department, location].filter(Boolean).join(" · ")}
            </>
          ) : (
            (department ?? t("noLocation"))
          )}
        </span>
      </span>
    </span>
  );
}
