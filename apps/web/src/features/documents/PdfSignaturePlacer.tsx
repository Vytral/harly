"use client";

/* eslint-disable @next/next/no-img-element */

import { useRef } from "react";
import { X } from "lucide-react";
import type { SignaturePlacement } from "@/lib/esign/native/bake";
import { usePdfPageRenderer } from "@/features/documents/usePdfPageRenderer";

/** A placement the recruiter is authoring. Widens SignaturePlacement with
 *  optional fields only, so existing callers passing bare {page,x,y,w,h}
 *  (NativeSignWorkspace's self-sign flow) keep typechecking untouched —
 *  `type` defaults to "signature" wherever it's absent. */
export type AuthorFieldPlacement = SignaturePlacement & {
  type?: "signature" | "text";
  label?: string | null;
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
  /** Cap on rendered page width in px. Callers with a wider viewport (e.g. a
   *  full-screen signing modal) can raise this so pages aren't stuck at the
   *  720px default sized for a narrow dialog column. */
  maxPageWidth?: number;
  /** Recruiter-authoring extras — omit entirely for read-only/self-sign use
   *  (NativeSignWorkspace manages its own remove/label UI separately). */
  onRemoveField?: (index: number) => void;
  onLabelChange?: (index: number, label: string) => void;
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
  maxPageWidth = 720,
  onRemoveField,
  onLabelChange,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { pages, error } = usePdfPageRenderer(fileUrl, maxPageWidth, rootRef, onPageCountChange);
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
    <div ref={rootRef} className="space-y-5 rounded-xl bg-muted/40 p-3">
      {pages.map((page) => (
        <div
          key={page.number}
          data-page={page.number}
          className="relative mx-auto w-full overflow-hidden rounded-md shadow-xs"
          style={{ aspectRatio: `${page.width}/${page.height}`, maxWidth: maxPageWidth }}
        >
          {placements.map((placement, index) => {
            if (placement.page !== page.number) return null;
            const isText = placement.type === "text";
            const isActive = activeIndex === index;
            return (
              <div
                key={index}
                role="button"
                tabIndex={0}
                onClick={() => onActiveIndexChange(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ")
                    onActiveIndexChange(index);
                }}
                className={`absolute z-10 rounded-sm border-2 border-dashed transition-colors ${
                  isText
                    ? isActive
                      ? "border-info bg-info/15"
                      : "border-info/50 bg-info/5 hover:bg-info/10"
                    : isActive
                      ? "border-primary bg-accent/60"
                      : "border-primary/40 bg-accent/20 hover:bg-accent/35"
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
                  <div
                    className="h-full w-full bg-ink/70"
                    aria-label="Empty signature field"
                  />
                )}
                <div
                  className="absolute inset-0 cursor-move"
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
                <div
                  className={`absolute -bottom-2 -right-2 size-4 cursor-se-resize rounded-full border-2 bg-background shadow-xs ${isText ? "border-info" : "border-primary"}`}
                  onPointerDown={(event) => startResize(event, index)}
                  onPointerMove={(event) => resize(event, index)}
                  onPointerUp={() => {
                    resizeRef.current = null;
                  }}
                  onPointerCancel={() => {
                    resizeRef.current = null;
                  }}
                />
                <span
                  className={`pointer-events-none absolute -top-6 left-0 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-xs ${isText ? "bg-info text-white" : "bg-primary text-primary-foreground"}`}
                >
                  {isText ? "Text" : "Signature"} {index + 1}
                </span>
                {onRemoveField ? (
                  <button
                    type="button"
                    aria-label="Remove field"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveField(index);
                    }}
                    className="absolute -top-6 -right-2 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-xs"
                  >
                    <X className="size-3" />
                  </button>
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
