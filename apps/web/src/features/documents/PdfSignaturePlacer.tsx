"use client";

/* eslint-disable @next/next/no-img-element */

import { useRef } from "react";
import { Copy, Trash2 } from "lucide-react";
import type { SignaturePlacement } from "@/lib/esign/native/bake";
import { usePdfPageRenderer } from "@/features/documents/usePdfPageRenderer";

/** A placement the recruiter is authoring. Widens SignaturePlacement with
 *  optional fields only, so existing callers passing bare {page,x,y,w,h}
 *  (NativeSignWorkspace's self-sign flow) keep typechecking untouched —
 *  `type` defaults to "signature" wherever it's absent. */
export type AuthorFieldPlacement = SignaturePlacement & {
  type?: "signature" | "text";
  label?: string | null;
  /** Zero-based recipient slot used by multi-signer native envelopes. */
  recipientIndex?: number;
};

type Props = {
  fileUrl: string;
  signatureDataUrl: string;
  hasSignature: boolean;
  placements: AuthorFieldPlacement[];
  activeIndex: number;
  onChange: (placements: AuthorFieldPlacement[]) => void;
  onActiveIndexChange: (index: number) => void;
  onPageCountChange?: (count: number) => void;
  onRotationChange?: (rotated: boolean) => void;
  /** Cap on rendered page width in px. Callers with a wider viewport (e.g. a
   *  full-screen signing modal) can raise this so pages aren't stuck at the
   *  720px default sized for a narrow dialog column. */
  maxPageWidth?: number;
  /** Recruiter-authoring extras — omit entirely for read-only/self-sign use
   *  (NativeSignWorkspace manages its own remove/label UI separately). */
  onRemoveField?: (index: number) => void;
  onLabelChange?: (index: number, label: string) => void;
  /** Duplicate the placement at `index` (contextual toolbar). */
  onDuplicate?: (index: number) => void;
  /** Move the placement at `index` to a 1-based page. */
  onPageChange?: (index: number, page: number) => void;
  /** Total pages, for the page picker in the contextual toolbar. */
  pageCount?: number;
  /** Clear the active selection (clicking empty PDF space). */
  onDeselect?: () => void;
};

export function PdfSignaturePlacer({
  fileUrl,
  signatureDataUrl,
  hasSignature,
  placements,
  activeIndex,
  onChange,
  onActiveIndexChange,
  onPageCountChange,
  onRotationChange,
  maxPageWidth = 720,
  onRemoveField,
  onLabelChange,
  onDuplicate,
  onPageChange,
  pageCount = 1,
  onDeselect,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { pages, error } = usePdfPageRenderer(fileUrl, maxPageWidth, rootRef, onPageCountChange, onRotationChange);
  const dragRef = useRef<{
    index: number;
    page: number;
    // Fractions of the page's OWN dimensions, not raw pixels — a raw pixel
    // offset computed against the starting page's rect drifts when the box
    // is dragged onto a page with a different height (pages share width via
    // maxPageWidth but can have different aspect ratios).
    offsetXFrac: number;
    offsetYFrac: number;
  } | null>(null);
  const resizeRef = useRef<{
    index: number;
    rect: DOMRect;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  function pageRect(event: React.PointerEvent<HTMLDivElement>) {
    return (
      event.currentTarget.parentElement?.parentElement?.getBoundingClientRect() ??
      null
    );
  }

  function startDrag(
    event: React.PointerEvent<HTMLDivElement>,
    index: number,
    page: number,
  ) {
    const rect = pageRect(event);
    const placement = placements[index];
    if (!rect || !placement) return;
    onActiveIndexChange(index);
    dragRef.current = {
      index,
      page,
      offsetXFrac: (event.clientX - rect.left) / rect.width - placement.x,
      offsetYFrac: (event.clientY - rect.top) / rect.height - placement.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function drag(event: React.PointerEvent<HTMLDivElement>) {
    const dragState = dragRef.current;
    const scrollContainer = rootRef.current?.closest<HTMLElement>(
      "[data-signature-scroll]",
    );
    const scrollBounds = scrollContainer?.getBoundingClientRect() ?? {
      top: 0,
      bottom: window.innerHeight,
    };
    const edge = 72;
    if (event.clientY < scrollBounds.top + edge) {
      scrollContainer?.scrollBy({
        top: -Math.max(8, (scrollBounds.top + edge - event.clientY) / 2),
      });
      if (!scrollContainer)
        window.scrollBy({
          top: -Math.max(8, (scrollBounds.top + edge - event.clientY) / 2),
        });
    } else if (event.clientY > scrollBounds.bottom - edge) {
      scrollContainer?.scrollBy({
        top: Math.max(8, (event.clientY - (scrollBounds.bottom - edge)) / 2),
      });
      if (!scrollContainer)
        window.scrollBy({
          top: Math.max(8, (event.clientY - (scrollBounds.bottom - edge)) / 2),
        });
    }
    const hoveredPage = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-page]");
    const targetPage = Number(hoveredPage?.dataset.page ?? dragState?.page);
    const rect = hoveredPage?.getBoundingClientRect() ?? pageRect(event);
    const placement = dragState ? placements[dragState.index] : null;
    if (!dragState || !rect || !placement || !Number.isInteger(targetPage))
      return;
    const x = Math.min(
      1 - placement.w,
      Math.max(0, (event.clientX - rect.left) / rect.width - dragState.offsetXFrac),
    );
    const y = Math.min(
      1 - placement.h,
      Math.max(0, (event.clientY - rect.top) / rect.height - dragState.offsetYFrac),
    );
    dragState.page = targetPage;
    onChange(
      placements.map((item, index) =>
        index === dragState.index ? { ...item, page: targetPage, x, y } : item,
      ),
    );
  }

  function resize(event: React.PointerEvent<HTMLDivElement>, index: number) {
    const resizeState = resizeRef.current;
    const placement = placements[index];
    if (!resizeState || resizeState.index !== index || !placement) return;
    const w = Math.min(
      1 - placement.x,
      Math.max(
        0.05,
        resizeState.startW +
          (event.clientX - resizeState.startX) / resizeState.rect.width,
      ),
    );
    const h = Math.min(
      1 - placement.y,
      Math.max(
        0.03,
        resizeState.startH +
          (event.clientY - resizeState.startY) / resizeState.rect.height,
      ),
    );
    onChange(
      placements.map((item, itemIndex) =>
        itemIndex === index ? { ...item, w, h } : item,
      ),
    );
  }

  function startResize(
    event: React.PointerEvent<HTMLDivElement>,
    index: number,
  ) {
    const rect = pageRect(event);
    const placement = placements[index];
    if (!rect || !placement) return;
    event.stopPropagation();
    onActiveIndexChange(index);
    resizeRef.current = {
      index,
      rect,
      startX: event.clientX,
      startY: event.clientY,
      startW: placement.w,
      startH: placement.h,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  if (error)
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </p>
    );
  return (
    <div ref={rootRef} className="space-y-5">
      {pages.map((page) => (
        <div
          key={page.number}
          data-page={page.number}
          className="relative mx-auto w-full overflow-hidden rounded-md shadow-xs"
          style={{ aspectRatio: `${page.width}/${page.height}`, maxWidth: maxPageWidth }}
          onPointerDown={(event) => {
            // Clicking anywhere on the page that isn't a placement box
            // deselects the active field, so the signer can "release" it.
            const target = event.target as HTMLElement;
            if (!target.closest("[data-field]")) onDeselect?.();
          }}
        >
          {placements.map((placement, index) => {
            if (placement.page !== page.number) return null;
            const isText = placement.type === "text";
            const isActive = activeIndex === index;
            return (
              <div
                key={index}
                data-field={index}
                role="button"
                tabIndex={0}
                onClick={() => onActiveIndexChange(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ")
                    onActiveIndexChange(index);
                }}
                className={`group/field absolute z-10 rounded-sm border border-dashed transition-colors ${
                  isText
                    ? isActive
                      ? "border-info bg-info/10"
                      : "border-info/40 bg-info/5"
                    : isActive
                      ? "border-primary/80 bg-white/40"
                      : "border-primary/40 bg-white/25"
                }`}
                style={{
                  left: `${placement.x * 100}%`,
                  top: `${placement.y * 100}%`,
                  width: `${placement.w * 100}%`,
                  height: `${placement.h * 100}%`,
                }}
              >
                {isText ? (
                  <div className="flex h-full w-full items-center justify-center px-1 text-center text-[11px] text-info">
                    {placement.label?.trim() || "Text field"}
                  </div>
                ) : hasSignature ? (
                  <img
                    src={signatureDataUrl}
                    alt={`Signature placement ${index + 1}`}
                    className="h-full w-full object-contain"
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
                    Signature
                  </div>
                )}
                <div
                  className="absolute inset-0 cursor-move touch-none"
                  onPointerDown={(event) =>
                    startDrag(event, index, page.number)
                  }
                  onPointerMove={drag}
                  onPointerUp={() => {
                    dragRef.current = null;
                  }}
                  onPointerCancel={() => {
                    dragRef.current = null;
                  }}
                />
                {/* Resize handle — larger hit area for laptop trackpads. */}
                <div
                  className={`absolute -bottom-2.5 -right-2.5 flex size-6 cursor-se-resize touch-none items-center justify-center rounded-full border-2 bg-background shadow-sm transition-transform hover:scale-110 ${isText ? "border-info" : "border-primary"} ${isActive ? "opacity-100" : "opacity-0 group-hover/field:opacity-100"}`}
                  onPointerDown={(event) => startResize(event, index)}
                  onPointerMove={(event) => resize(event, index)}
                  onPointerUp={() => {
                    resizeRef.current = null;
                  }}
                  onPointerCancel={() => {
                    resizeRef.current = null;
                  }}
                  aria-label={`Resize field ${index + 1}`}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden className={isText ? "text-info" : "text-primary"}>
                    <path d="M7 1 1 7M7 4 4 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </div>
                {isText || !hasSignature ? (
                  <span
                    className={`pointer-events-none absolute left-1 top-1 rounded px-1 py-px text-[9px] font-medium ${isText ? "text-info" : "text-primary"}`}
                  >
                    {isText ? `Text ${index + 1}` : `Sign ${index + 1}`}
                  </span>
                ) : null}

                {/* Contextual action toolbar — appears above the active field.
                    Duplicate / page picker / delete, all in one place instead
                    of scattered between the canvas and the side panel. */}
                {isActive && (onDuplicate || onRemoveField || onPageChange) ? (
                  <div
                    className="t-field-toolbar absolute -top-10 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border/70 bg-card/95 p-1 shadow-lg backdrop-blur"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {onPageChange && pageCount > 1 ? (
                      <>
                        <select
                          value={placement.page}
                          onChange={(event) =>
                            onPageChange(index, Number(event.target.value))
                          }
                          className="h-6 rounded-md border border-input bg-background px-1.5 text-[11px] font-medium outline-none focus:border-ring"
                          aria-label={`Page for field ${index + 1}`}
                        >
                          {Array.from({ length: pageCount }, (_, p) => (
                            <option key={p + 1} value={p + 1}>
                              Page {p + 1}
                            </option>
                          ))}
                        </select>
                        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
                      </>
                    ) : null}
                    {onDuplicate ? (
                      <button
                        type="button"
                        aria-label={`Duplicate field ${index + 1}`}
                        title="Duplicate"
                        onClick={() => onDuplicate(index)}
                        className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Copy className="size-3.5" />
                      </button>
                    ) : null}
                    {onRemoveField ? (
                      <button
                        type="button"
                        aria-label={`Remove field ${index + 1}`}
                        title="Delete"
                        onClick={() => onRemoveField(index)}
                        className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {isText && isActive && onLabelChange ? (
                  <input
                    type="text"
                    value={placement.label ?? ""}
                    onChange={(event) => onLabelChange(index, event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    placeholder="Label (e.g. Date)"
                    maxLength={60}
                    className="absolute -bottom-8 left-0 w-40 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-xs"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
      {pages.length === 0 ? (
        <div className="space-y-3 p-8">
          <div
            className="mx-auto h-[600px] w-full animate-pulse rounded-md bg-card"
            style={{ maxWidth: maxPageWidth }}
          />
          <p className="text-center text-sm text-muted-foreground">
            Loading PDF…
          </p>
        </div>
      ) : null}
      <p className="text-center text-xs text-muted-foreground">
        Drag a field across pages. Hold it near the top or bottom edge to
        scroll.
      </p>
    </div>
  );
}
