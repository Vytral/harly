import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Wrapper for a stack of <SettingRow>s inside a Card: rows separated by a
 * hairline, no extra chrome.
 */
function SettingRows({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="setting-rows"
      className={cn("divide-y divide-hairline", className)}
      {...props}
    />
  )
}

/** Small heading used to group rows inside a card. */
function SettingSection({
  title,
  description,
  action,
  className,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <section data-slot="setting-section" className={cn("py-1", className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-1">
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-sm font-semibold tracking-[-0.01em] text-near-ink">{title}</h3>
          {description ? (
            <p className="text-[12.5px] leading-snug text-soft-ink">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/**
 * Label + helper on the left, control on the right (desktop); stacked on
 * mobile. Pass `htmlFor` to tie the title to the control and set
 * `descriptionId` + aria-describedby on the control for the helper text.
 * `children` renders full-width below the header (expanded detail, textarea).
 */
function SettingRow({
  icon,
  title,
  description,
  control,
  children,
  htmlFor,
  descriptionId,
  align = "center",
  className,
}: {
  /** Optional leading icon, drawn in a 32px bordered square. */
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  control?: React.ReactNode
  children?: React.ReactNode
  htmlFor?: string
  descriptionId?: string
  align?: "center" | "start"
  className?: string
}) {
  const titleClass = "block text-[13px] leading-5 font-medium text-near-ink"
  return (
    <div data-slot="setting-row" className={cn("px-5 py-4", className)}>
      <div
        className={cn(
          "flex flex-col gap-3 sm:flex-row sm:justify-between sm:gap-6",
          align === "center" ? "sm:items-center" : "sm:items-start",
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
        {icon ? (
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow text-near-ink [&_svg]:size-4"
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1 space-y-0.5">
          {htmlFor ? (
            <label htmlFor={htmlFor} className={titleClass}>
              {title}
            </label>
          ) : (
            <div className={titleClass}>{title}</div>
          )}
          {description ? (
            <p id={descriptionId} className="text-[12.5px] leading-snug text-soft-ink">
              {description}
            </p>
          ) : null}
        </div>
        </div>
        {control ? (
          <div className="flex shrink-0 items-center gap-2 sm:justify-end">{control}</div>
        ) : null}
      </div>
      {React.Children.toArray(children).length > 0 ? (
        <div className={cn("mt-3 space-y-1", icon && "pl-11")}>{children}</div>
      ) : null}
    </div>
  )
}

export { SettingRow, SettingRows, SettingSection }
