"use client"

import * as React from "react"
import { AlertTriangleIcon, Loader2Icon, Trash2Icon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export type ConfirmTone = "default" | "destructive" | "warning"

export type ConfirmOptions = {
  tone?: ConfirmTone
  /** Phrase it as a question: "Delete 3 candidates?" */
  title: React.ReactNode
  /** State the consequence. */
  description?: React.ReactNode
  /** Callout slot rendered between the description and the buttons. */
  children?: React.ReactNode
  /** Specific verb: "Delete 3 candidates", not "OK". */
  confirmLabel?: string
  cancelLabel?: string
  /** When set, a checkbox with this label must be ticked before confirming. */
  requireAck?: string
  /** Overrides the tone icon. Pass null for no icon. */
  icon?: React.ReactNode | null
}

export type ConfirmDialogProps = ConfirmOptions & {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Disables the buttons and shows a spinner on confirm. */
  busy?: boolean
  /**
   * Runs on confirm. If it returns a promise the dialog stays open with a
   * spinner until it settles, then closes. Throwing keeps the dialog open.
   */
  onConfirm: () => void | Promise<void>
  /**
   * Close (onOpenChange(false)) once onConfirm settles. Pass false when the
   * parent closes the dialog itself, e.g. after the server answers.
   */
  closeOnConfirm?: boolean
}

// Resolved at render time (not module load) so partially mocked icon modules
// in unrelated tests are only touched when a dialog actually opens.
function toneIcon(tone: ConfirmTone): React.ReactNode {
  if (tone === "destructive") return <Trash2Icon />
  if (tone === "warning") return <AlertTriangleIcon />
  return null
}

const toneCircle: Record<ConfirmTone, string> = {
  default: "bg-lime-wash text-near-ink",
  destructive: "bg-danger-rust/10 text-danger-rust",
  warning: "bg-warning-clay/10 text-warning-clay",
}

function ConfirmDialog({
  open,
  onOpenChange,
  busy: busyProp,
  onConfirm,
  closeOnConfirm = true,
  ...options
}: ConfirmDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busyProp) return
        onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <ConfirmBody
          {...options}
          busyProp={busyProp}
          onConfirm={onConfirm}
          onClose={closeOnConfirm ? () => onOpenChange(false) : undefined}
        />
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Mounted only while open, so ack/busy state resets on every opening. */
function ConfirmBody({
  tone = "default",
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  requireAck,
  icon,
  busyProp,
  onConfirm,
  onClose,
}: ConfirmOptions & {
  busyProp?: boolean
  onConfirm: () => void | Promise<void>
  onClose?: () => void
}) {
  const [ack, setAck] = React.useState(false)
  const [running, setRunning] = React.useState(false)
  const busy = Boolean(busyProp) || running
  const ackId = React.useId()
  const resolvedIcon = icon === undefined ? toneIcon(tone) : icon

  async function handleConfirm(event: React.MouseEvent) {
    // Keep the dialog open until the work settles; we close it ourselves.
    event.preventDefault()
    if (busy || (requireAck && !ack)) return
    setRunning(true)
    try {
      await onConfirm()
      onClose?.()
    } catch {
      // The caller reports its own error; leave the dialog open for a retry.
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <AlertDialogHeader align="start" className={resolvedIcon ? "items-start" : undefined}>
        {resolvedIcon ? (
          <span
            aria-hidden="true"
            className={cn(
              "mb-2 flex size-10 items-center justify-center rounded-full [&_svg]:size-5",
              toneCircle[tone]
            )}
          >
            {resolvedIcon}
          </span>
        ) : null}
        <AlertDialogTitle>{title}</AlertDialogTitle>
        {description ? (
          <AlertDialogDescription>{description}</AlertDialogDescription>
        ) : null}
      </AlertDialogHeader>

      {children}

      {requireAck ? (
        <label
          htmlFor={ackId}
          className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-inner)] bg-card-inset p-3 text-sm text-near-ink"
        >
          <input
            id={ackId}
            type="checkbox"
            checked={ack}
            disabled={busy}
            onChange={(e) => setAck(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--near-ink)]"
          />
          <span>{requireAck}</span>
        </label>
      ) : null}

      <AlertDialogFooter layout="split">
        <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
        <AlertDialogAction
          variant={tone === "destructive" ? "destructive" : "default"}
          disabled={busy || Boolean(requireAck && !ack)}
          onClick={handleConfirm}
        >
          {busy ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}

/* ── Imperative API ─────────────────────────────────────────────────────── */

type Request = ConfirmOptions & { id: number; resolve: (ok: boolean) => void }
type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = React.createContext<ConfirmFn | null>(null)

/** Mount once near the root. Requests made while one is open are queued. */
function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = React.useState<Request[]>([])
  const [open, setOpen] = React.useState(true)
  const current = queue[0]
  const nextId = React.useRef(0)
  const settled = React.useRef<number | null>(null)

  const confirm = React.useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setQueue((q) => [...q, { ...options, id: nextId.current++, resolve }])
        setOpen(true)
      }),
    []
  )

  function settle(ok: boolean) {
    // Confirm closes via onOpenChange(false) right after; only the first call counts.
    if (!current || settled.current === current.id) return
    settled.current = current.id
    current.resolve(ok)
    setQueue((q) => q.slice(1))
    setOpen(true)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {current ? (
        <ConfirmDialog
          key={current.id}
          {...current}
          open={open}
          onOpenChange={(next) => {
            if (!next) settle(false)
          }}
          onConfirm={() => settle(true)}
        />
      ) : null}
    </ConfirmContext.Provider>
  )
}

/**
 * `const confirm = useConfirm(); if (!(await confirm({ ... }))) return;`
 * Without a provider (isolated tests) it falls back to window.confirm.
 */
function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext)
  return React.useMemo<ConfirmFn>(
    () =>
      ctx ??
      (async (options) => {
        if (typeof window === "undefined") return false
        const text = [options.title, options.description]
          .filter((part) => typeof part === "string")
          .join("\n\n")
        return window.confirm(text)
      }),
    [ctx]
  )
}

export { ConfirmDialog, ConfirmProvider, useConfirm }
