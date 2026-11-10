"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Sticky-in-card footer: Discard (outline) + Save changes (ink). When `dirty`
 * is passed, both are disabled while the form is pristine.
 */
function FormFooter({
  onDiscard,
  onSave,
  dirty,
  saving = false,
  saveLabel,
  discardLabel,
  saveType = "button",
  disabled = false,
  hint,
  className,
}: {
  onDiscard?: () => void
  onSave?: () => void
  dirty?: boolean
  saving?: boolean
  saveLabel?: React.ReactNode
  discardLabel?: React.ReactNode
  /** Use "submit" when the footer lives inside a <form>. */
  saveType?: "button" | "submit"
  disabled?: boolean
  hint?: React.ReactNode
  className?: string
}) {
  const t = useTranslations("ui.formFooter")
  const pristine = dirty === false
  return (
    <div
      data-slot="form-footer"
      className={cn(
        "sticky bottom-0 z-10 flex items-center justify-end gap-2 rounded-b-[var(--radius-card)] border-t border-hairline bg-card/95 px-5 py-3 backdrop-blur-sm",
        className,
      )}
    >
      {hint ? <p className="mr-auto text-[12.5px] text-soft-ink">{hint}</p> : null}
      {onDiscard ? (
        <Button type="button" variant="outline" onClick={onDiscard} disabled={pristine || saving || disabled}>
          {discardLabel ?? t("discard")}
        </Button>
      ) : null}
      <Button
        type={saveType}
        onClick={saveType === "button" ? onSave : undefined}
        disabled={pristine || saving || disabled}
      >
        {saving ? t("saving") : (saveLabel ?? t("save"))}
      </Button>
    </div>
  )
}

export { FormFooter }
