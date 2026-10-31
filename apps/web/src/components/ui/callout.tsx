import * as React from "react"
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  OctagonAlertIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

export type CalloutTone = "info" | "warning" | "success" | "danger"

const tones: Record<
  CalloutTone,
  { box: string; icon: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  info: {
    box: "border-status-quiet-ink/20 bg-status-quiet/60",
    icon: "text-status-quiet-ink",
    Icon: InfoIcon,
  },
  warning: {
    box: "border-warning-clay/25 bg-warning-clay/10",
    icon: "text-warning-clay",
    Icon: AlertTriangleIcon,
  },
  success: {
    box: "border-success-olive/25 bg-lime-wash",
    icon: "text-success-olive",
    Icon: CheckCircle2Icon,
  },
  danger: {
    box: "border-danger-rust/25 bg-danger-rust/10",
    icon: "text-danger-rust",
    Icon: OctagonAlertIcon,
  },
}

/** Tinted inline notice: icon + optional title + body. Danger/warning announce as alerts. */
function Callout({
  tone = "info",
  title,
  icon,
  children,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  tone?: CalloutTone
  title?: React.ReactNode
  /** Replace the default tone icon. */
  icon?: React.ReactNode
}) {
  const t = tones[tone]
  return (
    <div
      data-slot="callout"
      data-tone={tone}
      role={tone === "danger" || tone === "warning" ? "alert" : "note"}
      className={cn(
        "flex gap-3 rounded-[var(--radius-inner)] border p-3.5 text-left text-sm",
        t.box,
        className
      )}
      {...props}
    >
      <span className={cn("mt-0.5 shrink-0 [&_svg]:size-4", t.icon)} aria-hidden="true">
        {icon ?? <t.Icon />}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        {title ? <p className="font-medium text-near-ink">{title}</p> : null}
        {children ? (
          <div className="leading-5 text-soft-ink">{children}</div>
        ) : null}
      </div>
    </div>
  )
}

export { Callout }
