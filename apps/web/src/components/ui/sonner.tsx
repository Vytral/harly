"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "@/components/ThemeProvider"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Dark pill toasts. near-ink flips with the theme (ink in light, bone in dark)
 * so the pill is always the inverse of the surface behind it, and pure-snow is
 * the matching label color. Status shows in the icon only, never the fill.
 * The close button is shown for errors only (hidden via classNames below).
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="bottom-center"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-[var(--chartreuse-signal)]" />,
        info: <InfoIcon className="size-4 opacity-80" />,
        warning: <TriangleAlertIcon className="size-4 text-[var(--warning-clay)]" />,
        error: <OctagonXIcon className="size-4 text-[var(--danger-rust)]" />,
        loading: <Loader2Icon className="size-4 animate-spin opacity-80" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "!w-fit !max-w-[min(32rem,calc(100vw-2rem))] !mx-auto !items-center !gap-2.5 !rounded-full !border-0 !px-4 !py-2.5 !text-[13.5px] !font-medium !leading-5 !shadow-[var(--shadow-float)]",
          title: "!font-medium",
          description: "!text-[12.5px] !opacity-70",
          // Sonner shows the close button only on toasts that ask for it;
          // keep it for errors and hide it everywhere else.
          closeButton:
            "!border-0 !bg-white/15 !text-[var(--pure-snow)] [[data-sonner-toast]:not([data-type=error])_&]:!hidden",
        },
      }}
      style={
        {
          "--normal-bg": "var(--near-ink)",
          "--normal-text": "var(--pure-snow)",
          "--normal-border": "transparent",
          "--border-radius": "9999px",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
