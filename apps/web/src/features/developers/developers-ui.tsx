"use client";

import { useState, type ComponentType, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { SecretField } from "@/components/ui/secret-field";
import { CheckIcon, CopyIcon } from "@/components/ui/icons/phosphor";
import { toast } from "@/lib/notification-island/toast";
import { cn, copyText } from "@/lib/utils";

/** Shared building blocks for the Developers & API settings sections. */

export function copy(value: string) {
  copyText(value).then(
    () => toast.success("Copied"),
    () => toast.error("Could not copy"),
  );
}

/** Toggle chip used for scope multi-select. */
export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-near-ink/10",
        active
          ? "border-pine/40 bg-sage/50 text-sage-ink"
          : "bg-card text-muted-foreground hover:border-foreground/15 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function EmptyRow({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-inner)] border border-dashed border-hairline py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-xl bg-card-inset text-soft-ink">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium text-near-ink">{title}</p>
      <p className="max-w-sm px-4 text-[12.5px] text-soft-ink">{description}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function SecretBanner({
  label,
  value,
  onDismiss,
}: {
  label: string;
  value: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="animate-in fade-in zoom-in-95 duration-200 rounded-[var(--radius-inner)] border border-mist-border bg-lime-wash p-4 text-sm"
    >
      <p className="text-[13px] font-medium text-near-ink">{label}</p>
      <p className="mt-0.5 text-[12.5px] text-soft-ink">
        Copy it now. You won&apos;t be able to see it again.
      </p>
      <div className="mt-2">
        <SecretField
          value={value}
          label={label}
          defaultRevealed
          actions={
            <Button variant="ghost" className="shrink-0" onClick={onDismiss}>
              Done
            </Button>
          }
        />
      </div>
    </div>
  );
}

/** Code panel with a language label and a copy button. Scrolls, never wraps the page. */
export function CodePanel({
  code,
  language,
  className,
  maxHeightClass = "max-h-72",
}: {
  code: string;
  language: string;
  className?: string;
  maxHeightClass?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-[var(--radius-inner)] border border-hairline bg-card-inset",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2">
        <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-soft-ink">
          {language}
        </span>
        <button
          type="button"
          onClick={() => {
            copy(code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-soft-ink transition-colors hover:text-near-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-near-ink/10"
        >
          {copied ? (
            <>
              <CheckIcon className="size-3.5 text-success-olive" /> Copied
            </>
          ) : (
            <>
              <CopyIcon className="size-3.5" /> Copy
            </>
          )}
        </button>
      </div>
      <pre
        tabIndex={0}
        className={cn(
          "overflow-auto p-3.5 font-mono text-[12px] leading-relaxed text-near-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-near-ink/10",
          maxHeightClass,
        )}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
