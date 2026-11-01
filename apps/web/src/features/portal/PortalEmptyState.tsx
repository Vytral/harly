import Link from "next/link";
import type { Route } from "next";

import { cn } from "@/lib/utils";
import { ArrowUpRightIcon } from "@/components/ui/icons/phosphor";

type PortalEmptyStateProps = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  cta?: { label: string; href: Route };
  className?: string;
};

export function PortalEmptyState({
  icon: Icon,
  title,
  description,
  cta,
  className,
}: PortalEmptyStateProps) {
  return (
    <div
      className={cn(
        "animate-empty-state rounded-2xl border border-dashed border-hairline bg-card p-8 text-center sm:p-10",
        className,
      )}
    >
      <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-card-inset text-soft-ink">
        <Icon className="size-6" />
      </span>
      <h3 className="text-[15px] font-semibold text-near-ink">{title}</h3>
      {description && (
        <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-5 text-soft-ink">
          {description}
        </p>
      )}
      {cta && (
        <Link
          href={cta.href}
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-near-ink px-4 py-2 text-sm font-semibold text-pure-snow transition-[background-color,transform] duration-150 hover:bg-near-ink/90 active:scale-[0.98]"
        >
          {cta.label}
          <ArrowUpRightIcon className="size-3.5" />
        </Link>
      )}
    </div>
  );
}