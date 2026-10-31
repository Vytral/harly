"use client"

import * as React from "react"
import { UploadIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Click-or-drop file target. One look for every upload surface: a dashed
 * inset well that lifts to the lime wash while a file hovers over it.
 * Reports files only; validation and upload stay with the caller.
 */
function DropZone({
  onFiles,
  accept,
  multiple = false,
  disabled,
  title = "Drag a file here or click to browse",
  dropTitle = "Drop to attach",
  hint,
  icon,
  className,
  id,
  inputRef,
}: {
  onFiles: (files: File[]) => void
  accept?: string
  multiple?: boolean
  disabled?: boolean
  /** Primary line; swap in the chosen file name once there is one. */
  title?: React.ReactNode
  dropTitle?: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  className?: string
  id?: string
  inputRef?: React.Ref<HTMLInputElement>
}) {
  const localRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const setRefs = (node: HTMLInputElement | null) => {
    localRef.current = node
    if (typeof inputRef === "function") inputRef(node)
    else if (inputRef) (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node
  }

  return (
    <>
      <input
        ref={setRefs}
        id={id}
        type="file"
        className="sr-only"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          if (files.length > 0) onFiles(files)
          // Same file picked twice should still fire.
          event.target.value = ""
        }}
      />
      <button
        type="button"
        data-slot="drop-zone"
        data-dragging={dragging || undefined}
        disabled={disabled}
        onClick={() => localRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (disabled) return
          const files = Array.from(event.dataTransfer.files ?? [])
          if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1))
        }}
        className={cn(
          "flex w-full items-center gap-3 rounded-[var(--radius-inner)] border border-dashed px-4 py-5 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60",
          dragging
            ? "border-near-ink bg-lime-wash"
            : "border-mist-border bg-card-inset hover:bg-soft-kraft",
          className
        )}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-btn)] bg-lime-wash text-sage-ink [&_svg]:size-4">
          {icon ?? <UploadIcon />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-near-ink">
            {dragging ? dropTitle : title}
          </span>
          {hint ? <span className="mt-0.5 block text-xs text-soft-ink">{hint}</span> : null}
        </span>
      </button>
    </>
  )
}

/**
 * Full-container overlay for page-level drops. Render it inside a `relative`
 * parent while `active`; it never takes pointer events.
 */
function DropOverlay({
  active,
  children,
  className,
}: {
  active: boolean
  children: React.ReactNode
  className?: string
}) {
  if (!active) return null
  return (
    <div
      data-slot="drop-overlay"
      className={cn(
        "pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-[var(--radius-card)] border-2 border-dashed border-near-ink bg-lime-wash/80 backdrop-blur-[1px]",
        className
      )}
    >
      <div className="flex flex-col items-center gap-2 text-near-ink [&_svg]:size-8">
        <UploadIcon aria-hidden="true" />
        <p className="text-sm font-semibold">{children}</p>
      </div>
    </div>
  )
}

export { DropZone, DropOverlay }
