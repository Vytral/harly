import * as React from "react";

import { AlertCircleIcon } from "lucide-react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * A titled, hairline-bounded block grouping related form fields. Matches the
 * dashboard bento surfaces (rounded-2xl, soft border) so forms read as part of
 * the same designed system rather than stacked inputs.
 */
function FormSection({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] bg-card shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {title || action ? (
        <header className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="space-y-0.5">
            {title ? <h2 className="text-sm font-semibold">{title}</h2> : null}
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action}
        </header>
      ) : null}
      <div className={cn("p-5", contentClassName)}>{children}</div>
    </section>
  );
}

/** Helper (12.5px soft-ink) or error (12.5px rust + icon) line under a control. */
function FieldMessage({
  id,
  error,
  hint,
  className,
}: {
  id?: string;
  error?: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  if (error) {
    return (
      <p
        id={id}
        role="alert"
        className={cn("flex items-start gap-1.5 text-[12.5px] leading-snug text-danger-rust", className)}
      >
        <AlertCircleIcon aria-hidden className="mt-px size-3.5 shrink-0" />
        <span>{error}</span>
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} className={cn("text-[12.5px] leading-snug text-soft-ink", className)}>
        {hint}
      </p>
    );
  }
  return null;
}

/** Label + control + a single hint/error line. */
function FormField({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  className,
}: {
  label?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const messageId = htmlFor && (error || hint) ? `${htmlFor}-message` : undefined;
  // Wire helper/error text to a single control child (aria-describedby/invalid)
  // unless the caller already did.
  const describedChild =
    messageId && React.isValidElement<Record<string, unknown>>(children) && children.type !== React.Fragment
      ? React.cloneElement(children, {
          "aria-describedby": children.props["aria-describedby"] ?? messageId,
          ...(error ? { "aria-invalid": children.props["aria-invalid"] ?? true } : {}),
        })
      : children;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span aria-hidden className="text-danger-rust">*</span> : null}
        </Label>
      ) : null}
      {describedChild}
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}

export { FormSection, FormField, FieldMessage };
