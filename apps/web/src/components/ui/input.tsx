import * as React from "react"

import { cn } from "@/lib/utils"

/** Shared field chrome: also used by Textarea and SelectTrigger so all controls match. */
export const fieldControlClassName =
  "w-full min-w-0 rounded-[var(--radius-btn)] border border-mist-border bg-pure-snow px-3 text-base text-near-ink md:text-sm transition-[color,box-shadow,border-color,background-color] duration-150 ease-out outline-none placeholder:text-quiet-mist selection:bg-primary selection:text-primary-foreground hover:border-quiet-mist/70 focus-visible:border-near-ink focus-visible:ring-[3px] focus-visible:ring-near-ink/10 aria-invalid:border-danger-rust aria-invalid:ring-[3px] aria-invalid:ring-danger-rust/15 disabled:cursor-not-allowed disabled:border-mist-border disabled:bg-card-inset disabled:text-quiet-mist disabled:hover:border-mist-border"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldControlClassName,
        "h-9 py-1 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-near-ink",
        className
      )}
      {...props}
    />
  )
}

export { Input }
