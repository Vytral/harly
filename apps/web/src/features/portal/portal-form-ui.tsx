"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

export const portalInputClass = cn(
  "h-11 w-full rounded-xl border border-border bg-card px-3.5 text-base sm:text-sm text-foreground",
  "placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
  "transition-shadow aria-[invalid=true]:border-destructive",
);

export const portalPrimaryButtonClass = cn(
  "h-11 w-full rounded-xl bg-foreground text-sm font-semibold text-background shadow-sm",
  "transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]",
  "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
);

export const portalSecondaryButtonClass = cn(
  "flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground shadow-sm",
  "transition-all duration-150 hover:bg-muted active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed",
);

export const portalLinkButtonClass =
  "text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline";

export function PortalField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean;
  }) => React.ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": Boolean(error) })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PortalFormError({ message }: { message: string | null }) {
  // Always mounted so screen readers announce changes to the live region.
  return (
    <div role="alert" aria-live="assertive">
      {message ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** One-time recovery codes: shown once, with copy/download, then acknowledged. */
export function RecoveryCodesPanel({
  codes,
  onDone,
  doneLabel = "I've saved these codes",
}: {
  codes: string[];
  onDone: () => void;
  doneLabel?: string;
}) {
  const text = codes.join("\n");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* the codes stay selectable on screen */
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([text + "\n"], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "portal-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">Save your recovery codes</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          If you forget your password and there is no email on file, each code
          lets you reset it once. They won&apos;t be shown again. Keep them
          somewhere safe.
        </p>
      </div>
      <ul
        aria-label="Recovery codes"
        className="grid grid-cols-1 gap-1.5 rounded-xl border bg-muted/40 p-3 font-mono text-sm sm:grid-cols-2"
      >
        {codes.map((c) => (
          <li key={c} className="select-all">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button type="button" onClick={copy} className={portalSecondaryButtonClass}>
          Copy
        </button>
        <button type="button" onClick={download} className={portalSecondaryButtonClass}>
          Download
        </button>
      </div>
      <button type="button" onClick={onDone} className={portalPrimaryButtonClass}>
        {doneLabel}
      </button>
    </div>
  );
}
