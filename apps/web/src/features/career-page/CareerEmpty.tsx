import { SearchX, Briefcase } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Empty states for job lists, with the right copy for the right cause:
 * `none` = the company has no open roles, `filtered` = a filter excluded
 * everything. Both offer a next step.
 */
export function CareerEmpty({
  kind,
  onReset,
  portalEnabled = false,
  className,
}: {
  kind: "none" | "filtered";
  onReset?: () => void;
  portalEnabled?: boolean;
  className?: string;
}) {
  const filtered = kind === "filtered";
  const Icon = filtered ? SearchX : Briefcase;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center rounded-[var(--career-r-card,16px)] border border-dashed border-hairline px-6 py-14 text-center",
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-card-inset text-soft-ink">
        <Icon className="size-5" strokeWidth={1.6} aria-hidden />
      </span>
      <p className="mt-4 text-base font-semibold tracking-tight text-near-ink">
        {filtered ? "No roles match these filters" : "No open roles right now"}
      </p>
      <p className="mt-1 max-w-sm text-sm text-soft-ink">
        {filtered
          ? "Try removing a filter or searching for something broader."
          : "New roles show up here as soon as they open. Check back soon."}
      </p>
      {filtered && onReset ? (
        <button
          type="button"
          onClick={onReset}
          className="mt-5 inline-flex h-9 items-center rounded-[var(--career-r-btn,10px)] border border-hairline bg-pure-snow px-4 text-sm font-medium text-near-ink transition-colors hover:bg-row-wash"
        >
          Clear filters
        </button>
      ) : null}
      {!filtered && portalEnabled ? (
        <a
          href="/portal"
          className="mt-5 inline-flex h-9 items-center rounded-[var(--career-r-btn,10px)] border border-hairline bg-pure-snow px-4 text-sm font-medium text-near-ink transition-colors hover:bg-row-wash"
        >
          Open the candidate portal
        </a>
      ) : null}
    </div>
  );
}
