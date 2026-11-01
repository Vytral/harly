"use client"

import * as React from "react"
import { CheckIcon, MinusIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded-[5px] border border-mist-border bg-pure-snow transition-[background-color,border-color,box-shadow] duration-150 ease-out outline-none hover:border-quiet-mist focus-visible:border-near-ink focus-visible:ring-[3px] focus-visible:ring-near-ink/10 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger-rust aria-invalid:ring-[3px] aria-invalid:ring-danger-rust/15 data-[state=checked]:border-near-ink data-[state=checked]:bg-near-ink data-[state=checked]:text-pure-snow data-[state=indeterminate]:border-near-ink data-[state=indeterminate]:bg-near-ink data-[state=indeterminate]:text-pure-snow",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        {props.checked === "indeterminate" ? (
          <MinusIcon className="size-3" strokeWidth={3} />
        ) : (
          <CheckIcon className="size-3" strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
