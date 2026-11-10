"use client"

import * as React from "react"
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { cn, copyText } from "@/lib/utils"

/**
 * Monospace masked secret (API key, webhook secret, SMTP password) with
 * reveal + copy. Masks to bullets + last 4 chars until revealed.
 */
function SecretField({
  value,
  label,
  maskedValue,
  defaultRevealed = false,
  revealable = true,
  onCopy,
  actions,
  className,
}: {
  value: string
  /** Accessible name used for the toggle/copy buttons, e.g. "API key". */
  label?: string
  /** Override the masked rendering (e.g. server only returns a prefix). */
  maskedValue?: string
  defaultRevealed?: boolean
  /** Hide the eye toggle (e.g. value is already a masked preview). */
  revealable?: boolean
  onCopy?: () => void
  /** Extra actions, e.g. a Rotate button. */
  actions?: React.ReactNode
  className?: string
}) {
  const t = useTranslations("ui.secretField")
  const fieldLabel = label ?? t("defaultLabel")
  const [revealed, setRevealed] = React.useState(defaultRevealed)
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const masked = maskedValue ?? `••••${value.slice(-4)}`

  async function copy() {
    try {
      await copyText(value)
    } catch {
      return
    }
    onCopy?.()
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div data-slot="secret-field" className={cn("flex w-full items-center gap-2", className)}>
      <div className="flex h-9 min-w-0 flex-1 items-center rounded-[var(--radius-btn)] border border-mist-border bg-card-inset px-3">
        <code
          className="min-w-0 flex-1 truncate font-mono text-[13px] text-near-ink select-all"
          aria-label={revealed ? fieldLabel : t("hiddenLabel", { label: fieldLabel })}
        >
          {revealed || !revealable ? value : masked}
        </code>
      </div>
      {revealable ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={revealed ? t("hide", { label: fieldLabel }) : t("show", { label: fieldLabel })}
          aria-pressed={revealed}
          onClick={() => setRevealed((v) => !v)}
        >
          {revealed ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
      ) : null}
      <Button type="button" variant="outline" onClick={copy} aria-label={t("copyLabel", { label: fieldLabel })}>
        {copied ? <CheckIcon className="text-success-olive" /> : <CopyIcon />}
        <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
      </Button>
      {actions}
    </div>
  )
}

export { SecretField }
