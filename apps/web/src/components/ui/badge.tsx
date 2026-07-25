import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  // Status and taxonomy badges are fully pill (DESIGN.md , Status Pill), set in
  // the chrome face at 12px so they hold as labels rather than speech.
  "font-chrome inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 py-0.5 text-[12px] leading-[18px] whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
        /*
         * Success is NOT the brand accent. It used to be a solid chartreuse
         * fill, which put the signal colour on every "Open" job and every
         * "Hired" candidate , the exact spray DESIGN.md rations against. Sage
         * wash + success olive reads as confirmation without claiming to be a
         * live signal.
         */
        success: "bg-sage-wash text-success-olive",
        warning: "bg-warning-clay/10 text-warning-clay",
        info: "bg-status-quiet text-status-quiet-ink",
        danger: "bg-danger-rust/10 text-danger-rust",
        // The frame's default state pill: cool grey-blue, silent.
        neutral: "bg-status-quiet text-status-quiet-ink",
        // Solid ink taxonomy tag (`Product` in frame 01).
        tag: "bg-tag-solid text-pure-snow dark:text-warm-paper",
        // Chartreuse stays available, but only for genuine live signals.
        signal: "bg-chartreuse-signal text-chartreuse-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
