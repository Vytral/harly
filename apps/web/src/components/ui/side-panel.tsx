"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Drawer as DrawerPrimitive } from "vaul"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

type SidePanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
}

/**
 * Contextual work surface: right-side panel on desktop and a Vaul bottom sheet
 * on mobile. Use a full page for multi-section or editor-heavy workflows.
 */
function SidePanel(props: SidePanelProps) {
  const isMobile = useMediaQuery("(max-width: 767px)")

  if (isMobile) {
    return <MobileSidePanel {...props} />
  }

  return <DesktopSidePanel {...props} />
}

function DesktopSidePanel({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  footer,
  children,
  className,
}: SidePanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn("flex w-full flex-col gap-0 p-0 sm:max-w-md", className)}
      >
        <PanelHeader
          title={<SheetTitle>{title}</SheetTitle>}
          description={description ? <SheetDescription>{description}</SheetDescription> : undefined}
          close={<SheetClose asChild><CloseButton /></SheetClose>}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <PanelFooter>{footer}</PanelFooter> : null}
      </SheetContent>
    </Sheet>
  )
}

function MobileSidePanel({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  footer,
  children,
  className,
}: SidePanelProps) {
  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} direction="bottom" handleOnly fixed>
      {trigger ? <DrawerPrimitive.Trigger asChild>{trigger}</DrawerPrimitive.Trigger> : null}
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DrawerPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[calc(100dvh-0.75rem)] flex-col rounded-t-xl border bg-background shadow-lg outline-none",
            className,
          )}
        >
          <DrawerPrimitive.Handle className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-muted-foreground/30" />
          <PanelHeader
            title={<DrawerPrimitive.Title>{title}</DrawerPrimitive.Title>}
            description={description ? <DrawerPrimitive.Description>{description}</DrawerPrimitive.Description> : undefined}
            close={<DrawerPrimitive.Close asChild><CloseButton /></DrawerPrimitive.Close>}
          />
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer ? <PanelFooter>{footer}</PanelFooter> : null}
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  )
}

function PanelHeader({
  title,
  description,
  close,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  close: React.ReactNode
}) {
  return (
    <div className="relative shrink-0 border-b px-5 py-4 pr-12">
      <div className="flex flex-col gap-1.5 text-left">
        <div className="font-semibold text-foreground">{title}</div>
        {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
      </div>
      <div className="absolute top-3.5 right-3.5">{close}</div>
    </div>
  )
}

function PanelFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-auto flex shrink-0 flex-row justify-end gap-2 border-t px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      {children}
    </div>
  )
}

function CloseButton(props: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label="Close panel"
      {...props}
    >
      <XIcon className="size-4" />
    </Button>
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

export { SidePanel }
