"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"
import { Drawer as DrawerPrimitive } from "vaul"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

type SheetPresentation = "side" | "bottom-on-mobile"

const sheetCloseClasses =
  "absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-full text-soft-ink transition-colors outline-none hover:bg-card-inset hover:text-near-ink focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none"

const SheetContext = React.createContext({ useMobileDrawer: false })

function Sheet({
  mobilePresentation = "side",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Root> & {
  mobilePresentation?: SheetPresentation
}) {
  const isMobile = useMediaQuery("(max-width: 767px)")
  const useMobileDrawer = mobilePresentation === "bottom-on-mobile" && isMobile

  return (
    <SheetContext.Provider value={{ useMobileDrawer }}>
      {useMobileDrawer ? (
        <DrawerPrimitive.Root data-slot="sheet" direction="bottom" handleOnly fixed {...props} />
      ) : (
        <SheetPrimitive.Root data-slot="sheet" {...props} />
      )}
    </SheetContext.Provider>
  )
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  const { useMobileDrawer } = React.useContext(SheetContext)

  return useMobileDrawer ? (
    <DrawerPrimitive.Trigger data-slot="sheet-trigger" {...props} />
  ) : (
    <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
  )
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  const { useMobileDrawer } = React.useContext(SheetContext)

  return useMobileDrawer ? (
    <DrawerPrimitive.Close data-slot="sheet-close" {...props} />
  ) : (
    <SheetPrimitive.Close data-slot="sheet-close" {...props} />
  )
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  const { useMobileDrawer } = React.useContext(SheetContext)

  return useMobileDrawer ? (
    <DrawerPrimitive.Portal data-slot="sheet-portal" {...props} />
  ) : (
    <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
  )
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  const { useMobileDrawer } = React.useContext(SheetContext)

  if (useMobileDrawer) {
    return (
      <DrawerPrimitive.Overlay
        data-slot="sheet-overlay"
        className={cn("fixed inset-0 z-50 bg-ink/30", className)}
        {...props}
      />
    )
  }

  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-ink/30 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-[160ms] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-[220ms] motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  const t = useTranslations("ui.sheet")
  const { useMobileDrawer } = React.useContext(SheetContext)

  if (useMobileDrawer) {
    return (
      <DrawerPrimitive.Portal>
        <SheetOverlay />
        <DrawerPrimitive.Content
          data-slot="sheet-content"
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[calc(100dvh-0.75rem)] flex-col rounded-t-[var(--radius-card)] bg-pure-snow shadow-[var(--shadow-float)] outline-none",
            className,
          )}
          {...props}
        >
          <DrawerPrimitive.Handle className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-muted-foreground/30" />
          {children}
          {showCloseButton && (
            <DrawerPrimitive.Close className={sheetCloseClasses}>
              <XIcon className="size-4" />
              <span className="sr-only">{t("close")}</span>
            </DrawerPrimitive.Close>
          )}
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    )
  }

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex flex-col gap-4 overflow-y-auto bg-pure-snow text-near-ink shadow-[var(--shadow-float)] outline-none ease-out data-[state=closed]:animate-out data-[state=closed]:duration-[160ms] data-[state=open]:animate-in data-[state=open]:duration-[220ms] motion-reduce:animate-none",
          // Floating drawer: 8px inset from the viewport, 16px radius all round.
          side === "right" &&
            "inset-y-2 right-2 h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] rounded-[var(--radius-card)] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
          side === "left" &&
            "inset-y-2 left-2 h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] rounded-[var(--radius-card)] data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
          side === "top" &&
            "inset-x-2 top-2 h-auto rounded-[var(--radius-card)] data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
          side === "bottom" &&
            "inset-x-2 bottom-2 h-auto rounded-[var(--radius-card)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close className={sheetCloseClasses}>
            <XIcon className="size-4" />
            <span className="sr-only">{t("close")}</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1 p-5 pr-14 pb-0", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "sticky bottom-0 mt-auto flex flex-col-reverse gap-2 border-t border-hairline bg-pure-snow p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  const { useMobileDrawer } = React.useContext(SheetContext)

  if (useMobileDrawer) {
    return <DrawerPrimitive.Title data-slot="sheet-title" className={cn("text-[18px] leading-snug font-semibold tracking-tight text-near-ink", className)} {...props} />
  }

  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-[18px] leading-snug font-semibold tracking-tight text-near-ink", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  const { useMobileDrawer } = React.useContext(SheetContext)

  if (useMobileDrawer) {
    return <DrawerPrimitive.Description data-slot="sheet-description" className={cn("text-sm leading-6 text-soft-ink", className)} {...props} />
  }

  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm leading-6 text-soft-ink", className)}
      {...props}
    />
  )
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(false)

  React.useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)

    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [query])

  return matches
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
