"use client"

import * as React from "react"
import { ArrowLeftIcon, XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/**
 * Modal anatomy (Deel-inspired): ink/30 scrim (no blur), a white
 * 16px card with no border, floating shadow, 24px padding and 20px rhythm.
 * Enter is fade + scale 0.97 -> 1 over 180ms, exit 140ms; reduced motion
 * collapses both to an instant swap. AlertDialog shares these constants so the
 * two never drift into different-looking modals.
 */
export type DialogSize = "sm" | "md" | "lg" | "xl" | "full"

export const dialogSizeClasses: Record<DialogSize, string> = {
  sm: "sm:max-w-[400px]",
  md: "sm:max-w-[480px]",
  lg: "sm:max-w-[640px]",
  xl: "sm:max-w-[860px]",
  full: "h-[calc(100dvh-2rem)] sm:max-w-[calc(100%-2rem)]",
}

export const dialogOverlayClasses =
  "fixed inset-0 z-50 bg-ink/30 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-[180ms] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-[140ms] motion-reduce:animate-none motion-reduce:duration-0"

export const dialogContentClasses =
  "fixed top-[50%] left-[50%] z-50 grid max-h-[85dvh] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] content-start gap-5 overflow-y-auto rounded-[var(--radius-card)] bg-pure-snow p-6 text-near-ink shadow-[var(--shadow-float)] outline-none ease-out data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=open]:duration-[180ms] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] data-[state=closed]:duration-[140ms] motion-reduce:animate-none motion-reduce:duration-0"

const dialogIconButtonClasses =
  "absolute top-4 inline-flex size-8 items-center justify-center rounded-full text-soft-ink transition-colors outline-none hover:bg-card-inset hover:text-near-ink focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(dialogOverlayClasses, className)}
      {...props}
    />
  )
}

function DialogContent({
  className,
  overlayClassName,
  children,
  showCloseButton = true,
  size = "md",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  overlayClassName?: string
  showCloseButton?: boolean
  /** sm 400 / md 480 (default) / lg 640 / xl 860 / full (viewport minus gutter). */
  size?: DialogSize
}) {
  const t = useTranslations("ui.dialog")
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-size={size}
        className={cn(dialogContentClasses, dialogSizeClasses[size], className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className={cn(dialogIconButtonClasses, "right-4")}
          >
            <XIcon />
            <span className="sr-only">{t("close")}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

/** Top-left arrow for multi-step dialogs. Pass onClick to go to the previous step. */
function DialogBack({
  className,
  children,
  ...props
}: React.ComponentProps<"button">) {
  const t = useTranslations("ui.dialog")
  return (
    <button
      type="button"
      data-slot="dialog-back"
      className={cn(dialogIconButtonClasses, "left-4", className)}
      {...props}
    >
      {children ?? (
        <>
          <ArrowLeftIcon />
          <span className="sr-only">{t("back")}</span>
        </>
      )}
    </button>
  )
}

/** Centered 96px slot for a spot illustration, above the header. */
function DialogMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-media"
      aria-hidden="true"
      className={cn(
        "mx-auto flex size-24 items-center justify-center text-near-ink [&>svg]:size-full",
        className
      )}
      {...props}
    />
  )
}

function DialogHeader({
  className,
  align = "start",
  ...props
}: React.ComponentProps<"div"> & {
  /** "center" suits confirms and success; "start" suits forms and long copy. */
  align?: "center" | "start"
}) {
  return (
    <div
      data-slot="dialog-header"
      data-align={align}
      className={cn(
        "flex flex-col gap-1.5",
        align === "center" ? "text-center" : "text-left",
        className
      )}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  layout = "end",
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /** end: buttons right. split: two equal columns. stack: full-width column. */
  layout?: "end" | "split" | "stack"
  showCloseButton?: boolean
}) {
  const t = useTranslations("ui.dialog")
  return (
    <div
      data-slot="dialog-footer"
      data-layout={layout}
      className={cn(
        layout === "end" && "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        layout === "split" && "grid grid-cols-2 gap-3 [&>*]:w-full",
        layout === "stack" && "flex flex-col gap-2 [&>*]:w-full",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="soft">{t("close")}</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "text-[18px] leading-snug font-semibold tracking-tight text-near-ink",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm leading-6 text-soft-ink", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBack,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogMedia,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
