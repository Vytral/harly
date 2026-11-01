import * as React from "react"

import { cn } from "@/lib/utils"
import { SpotSuccess } from "@/components/ui/spot-illustrations"

/**
 * Centered confirmation moment: spot illustration, title, one sentence, one CTA.
 * Fits inside a dialog body or as a full-page result.
 */
function SuccessState({
  illustration,
  title,
  description,
  action,
  className,
}: {
  /** Defaults to the lime check spot. */
  illustration?: React.ReactNode
  title: string
  description?: React.ReactNode
  /** Exactly one call to action, usually a Button. */
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="success-state"
      role="status"
      className={cn("flex flex-col items-center gap-5 py-2 text-center", className)}
    >
      <div aria-hidden="true" className="flex size-24 items-center justify-center [&>svg]:size-full">
        {illustration ?? <SpotSuccess />}
      </div>
      <div className="space-y-1.5">
        <h2 className="text-[18px] leading-snug font-semibold tracking-tight text-near-ink">
          {title}
        </h2>
        {description ? (
          <p className="mx-auto max-w-sm text-sm leading-6 text-soft-ink">{description}</p>
        ) : null}
      </div>
      {action ? <div className="w-full sm:w-auto [&>*]:w-full sm:[&>*]:w-auto">{action}</div> : null}
    </div>
  )
}

export { SuccessState }
