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
        "rounded-2xl border border-dashed border-border bg-card p-8 text-center sm:p-10",
        className,
      )}
    >
      <Icon className="mx-auto mb-3 size-10 text-muted-foreground/60" />
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 mx-auto max-w-xs text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {cta && (
        <Link
          href={cta.href}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-pine px-4 py-2 text-sm font-semibold text-white hover:bg-pine-strong active:scale-[0.98] transition-colors"
        >
          {cta.label}
          <ArrowUpRightIcon className="size-3.5" />
        </Link>
      )}
    </div>
  );
}